import create, { State } from 'zustand'
import { Connection, PublicKey, LAMPORTS_PER_SOL, ParsedTransactionWithMeta, ConfirmedSignatureInfo } from '@solana/web3.js'

export interface TxRecord {
  signature: string;
  blockTime: number | null | undefined;
  type: 'send' | 'receive' | 'unknown';
  amount: number;
  counterparty: string;
  status: 'confirmed' | 'failed';
}

interface TransactionStore extends State {
  transactions: TxRecord[];
  loading: boolean;
  fetchTransactions: (publicKey: PublicKey, connection: Connection) => void;
}

const useTransactionStore = create<TransactionStore>((set) => ({
  transactions: [],
  loading: false,

  fetchTransactions: async (publicKey: PublicKey, connection: Connection) => {
    set((s) => { s.loading = true; });
    try {
      const sigs: ConfirmedSignatureInfo[] = await connection.getSignaturesForAddress(publicKey, { limit: 20 });
      const pubStr = publicKey.toBase58();
      const records: TxRecord[] = [];

      for (const sig of sigs) {
        try {
          const tx: ParsedTransactionWithMeta | null = await connection.getParsedTransaction(sig.signature, {
            maxSupportedTransactionVersion: 0,
          });
          if (!tx) continue;

          let type: TxRecord['type'] = 'unknown';
          let amount = 0;
          let counterparty = '???';

          const instructions = tx.transaction.message.instructions;
          for (const ix of instructions) {
            if ('parsed' in ix && ix.parsed?.type === 'transfer') {
              const info = ix.parsed.info;
              amount = (info.lamports ?? 0) / LAMPORTS_PER_SOL;
              if (info.source === pubStr) {
                type = 'send';
                counterparty = info.destination ?? '???';
              } else {
                type = 'receive';
                counterparty = info.source ?? '???';
              }
              break;
            }
          }

          // fallback: use pre/post balances
          if (type === 'unknown') {
            const accountKeys = tx.transaction.message.accountKeys;
            const idx = accountKeys.findIndex(
              (k) => ('pubkey' in k ? k.pubkey.toBase58() : (k as any).toBase58()) === pubStr
            );
            if (idx >= 0 && tx.meta) {
              const delta = (tx.meta.postBalances[idx] - tx.meta.preBalances[idx]) / LAMPORTS_PER_SOL;
              amount = Math.abs(delta);
              type = delta >= 0 ? 'receive' : 'send';
            }
          }

          records.push({
            signature: sig.signature,
            blockTime: sig.blockTime,
            type,
            amount,
            counterparty,
            status: sig.err ? 'failed' : 'confirmed',
          });
        } catch {
          // skip failed parse
        }
      }

      set((s) => {
        s.transactions = records;
        s.loading = false;
      });
    } catch (e) {
      console.log('fetch tx error:', e);
      set((s) => { s.loading = false; });
    }
  },
}));

export default useTransactionStore;
