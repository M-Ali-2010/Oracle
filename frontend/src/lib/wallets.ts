import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';

export const getWallets = async () => {
  const wallets: any[] = [
    new PhantomWalletAdapter(),
  ];

  // 👇 lazy load Ledger (только в браузере)
  if (typeof window !== 'undefined') {
    try {
      const { LedgerWalletAdapter } = await import(
        '@solana/wallet-adapter-wallets'
      );

      wallets.push(new LedgerWalletAdapter());
    } catch (e) {
      console.warn('Ledger not loaded:', e);
    }
  }

  return wallets;
};



