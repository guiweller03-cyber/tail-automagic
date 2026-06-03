DROP TABLE IF EXISTS coupon_uses CASCADE;
DROP TABLE IF EXISTS coupons CASCADE;

CREATE TABLE coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  type text NOT NULL CHECK (type IN ('influencer', 'referral')),
  discount_percent int NOT NULL,
  commission_percent int DEFAULT 0,
  influencer_name text,
  influencer_email text,
  max_uses int,
  use_count int DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE coupon_uses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid REFERENCES coupons(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id),
  order_id text NOT NULL,
  order_value numeric NOT NULL,
  discount_applied numeric NOT NULL,
  commission_value numeric DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

DROP TABLE IF EXISTS credit_transactions CASCADE;
DROP TABLE IF EXISTS user_credits CASCADE;
DROP TABLE IF EXISTS referrals CASCADE;

CREATE TABLE referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid REFERENCES auth.users(id),
  referred_id uuid REFERENCES auth.users(id),
  referral_code text NOT NULL,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
  order_id text,
  order_value numeric,
  credit_amount numeric,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE user_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) UNIQUE,
  amount numeric DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  referral_id uuid REFERENCES referrals(id),
  amount numeric NOT NULL,
  type text NOT NULL CHECK (type IN ('earned', 'used')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupon_uses ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_own_coupon_uses" ON coupon_uses FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "user_own_referrals" ON referrals FOR SELECT USING (referrer_id = auth.uid() OR referred_id = auth.uid());
CREATE POLICY "user_own_credits" ON user_credits FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "user_own_transactions" ON credit_transactions FOR SELECT USING (user_id = auth.uid());
