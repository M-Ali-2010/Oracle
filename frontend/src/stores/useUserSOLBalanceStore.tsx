import create, { State } from 'zustand'
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js'

interface UserSOLBalanceStore extends State {
  balance: number;
  solPrice: number;
  priceChange24h: number;
  getUserSOLBalance: (publicKey: PublicKey, connection: Connection) => void;
  getSolPrice: () => void;
}

const useUserSOLBalanceStore = create<UserSOLBalanceStore>((set, _get) => ({
  balance: 0,
  solPrice: 0,
  priceChange24h: 0,

  getUserSOLBalance: async (publicKey, connection) => {
    let balance = 0;
    try {
      balance = await connection.getBalance(publicKey, 'confirmed');
      balance = balance / LAMPORTS_PER_SOL;
    } catch (e) {
      console.log('error getting balance: ', e);
    }
    set((s) => {
      s.balance = balance;
    });
  },

  getSolPrice: async () => {
    try {
      const res = await fetch('/api/price')
      const data = await res.json();
      set((s) => {
        s.solPrice = data?.solana?.usd ?? 0;
        s.priceChange24h = data?.solana?.usd_24h_change ?? 0;
      });
    } catch (e) {
      console.log('price fetch error:', e);
    }
  },
}));

export default useUserSOLBalanceStore;
