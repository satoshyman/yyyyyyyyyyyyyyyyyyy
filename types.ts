
export interface AppConfig {
  rewards: {
    mine: number;
    faucet: number;
    daily: number;
  };
  ads: {
    mine: string;
    faucet: string;
    daily: string;
    double: string;
  };
  limits: {
    min_withdraw: number;
    ref_percent: number;
    ref_bonus: number; // New field for fixed reward
  };
  api_key: string;
}

export interface UserData {
  uid: string;
  balance: number;
  friends: number;
  refEarned: number;
  joined: number;
  referrer?: string;
}

export interface Withdrawal {
  uid: string;
  email: string;
  amount: number;
  status: 'PENDING' | 'PAID' | 'REJECTED';
  time: number;
}
