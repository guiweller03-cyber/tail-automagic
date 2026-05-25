import { MercadoPagoConfig, Payment, Preference } from "mercadopago";

type PedidoPix = {
  id: string;
  valor: number;
  descricao: string;
  email: string;
};

type StatusPagamento = "approved" | "pending" | "rejected";

function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

function paymentClient(): Payment {
  const client = new MercadoPagoConfig({
    accessToken: requireEnv("MP_ACCESS_TOKEN"),
  });

  return new Payment(client);
}

function normalizarStatus(status?: string): StatusPagamento {
  if (status === "approved" || status === "rejected") return status;
  return "pending";
}

export async function gerarPixPedido(pedido: PedidoPix): Promise<{
  qr_code: string;
  qr_code_base64: string;
  id: string;
  status: string;
}> {
  const payment = paymentClient();
  const response = await payment.create({
    body: {
      payment_method_id: "pix",
      transaction_amount: pedido.valor,
      description: pedido.descricao,
      payer: {
        email: pedido.email,
      },
      external_reference: pedido.id,
      notification_url: requireEnv("MP_WEBHOOK_URL"),
    },
    requestOptions: {
      idempotencyKey: pedido.id,
    },
  });

  const qrCode = response.point_of_interaction?.transaction_data?.qr_code;
  const qrCodeBase64 = response.point_of_interaction?.transaction_data?.qr_code_base64;

  if (!response.id || !qrCode || !qrCodeBase64) {
    throw new Error("Mercado Pago nao retornou dados do Pix");
  }

  return {
    qr_code: qrCode,
    qr_code_base64: qrCodeBase64,
    id: String(response.id),
    status: response.status ?? "pending",
  };
}

export async function buscarPagamentoMercadoPago(paymentId: string): Promise<{
  id: string;
  status: StatusPagamento;
  external_reference: string | null;
}> {
  const payment = paymentClient();
  const response = await payment.get({ id: paymentId });

  return {
    id: String(response.id ?? paymentId),
    status: normalizarStatus(response.status),
    external_reference: response.external_reference ?? null,
  };
}

export async function verificarPagamento(paymentId: string): Promise<StatusPagamento> {
  const pagamento = await buscarPagamentoMercadoPago(paymentId);
  return pagamento.status;
}
// Cria preferência de pagamento (checkout web ou mobile)
export async function criarPreferenciaPagamento({
  itens,
  description,
  externalReference,
}: {
  itens: Array<{ title: string; quantity: number; unit_price: number }>;
  description?: string;
  externalReference?: string;
}): Promise<{ id: string; init_point?: string }> {
  const client = new MercadoPagoConfig({
    accessToken: requireEnv("MP_ACCESS_TOKEN"),
  });
  const preference = new Preference(client);
  const response = await preference.create({
    body: {
      items: itens.map((i) => ({
        id: i.title,
        title: i.title,
        quantity: i.quantity,
        unit_price: i.unit_price,
      })),
      additional_info: description,
      external_reference: externalReference,
    },
  });
  if (!response.id) {
    throw new Error("Falha ao criar preferência de pagamento");
  }
  return { id: response.id, init_point: response.init_point };
}
