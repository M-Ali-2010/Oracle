import create  from 'zustand'
import { PublicKey, Connection } from '@solana/web3.js'

interface State {
  balance: number
  solPrice: number
  priceChange24h: number

  setBalance: (val: number) => void
  getUserSOLBalance: (pubkey: PublicKey, connection: Connection) => Promise<void>
  getSolPrice: () => Promise<void>
}

const useUserSOLBalanceStore = create<State>((set) => ({
  balance: 0,
  solPrice: 0,
  priceChange24h: 0,

  setBalance: (val) => set({ balance: val }),

  getUserSOLBalance: async (pubkey, connection) => {
    const balance = await connection.getBalance(pubkey)
    set({ balance: balance / 1e9 }) // lamports → SOL
  },

  getSolPrice: async () => {
    try {
      const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd&include_24hr_change=true')
      const data = await res.json()

      set({
        solPrice: data.solana.usd,
        priceChange24h: data.solana.usd_24h_change,
      })
    } catch (e) {
      console.error(e)
    }
  },
}))

export default useUserSOLBalanceStore