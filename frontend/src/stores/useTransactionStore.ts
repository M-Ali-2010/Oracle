import create from 'zustand'
import { PublicKey, Connection } from '@solana/web3.js'

export type TxRecord = {
  signature: string
  type: 'send' | 'receive'
  status: 'success' | 'failed'
  counterparty: string
  amount: number
  description?: string
}

interface State {
  transactions: TxRecord[]
  loading: boolean

  add: (tx: TxRecord) => void
  fetchTransactions: (pubkey: PublicKey, connection: Connection) => Promise<void>
}

const useTransactionStore = create<State>((set) => ({
  transactions: [],
  loading: false,

  add: (tx) =>
    set((state) => ({
      transactions: [tx, ...state.transactions],
    })),

  fetchTransactions: async (pubkey, connection) => {
    try {
      set({ loading: true })

      const signatures = await connection.getSignaturesForAddress(pubkey, {
        limit: 10,
      })

      const txs: TxRecord[] = signatures.map((sig) => ({
        signature: sig.signature,
        type: 'receive', // пока заглушка
        status: sig.err ? 'failed' : 'success',
        counterparty: 'Unknown',
        amount: 0,
      }))

      set({ transactions: txs })
    } catch (e) {
      console.error(e)
    } finally {
      set({ loading: false })
    }
  },
}))

export default useTransactionStore