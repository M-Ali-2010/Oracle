'use client'

import { WalletAdapterNetwork, WalletError } from '@solana/wallet-adapter-base'
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react'
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import { FC, ReactNode, useCallback, useMemo } from 'react'
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets'
import { AutoConnectProvider, useAutoConnect } from './AutoConnectProvider'
import { notify } from '../utils/notifications'
import '@solana/wallet-adapter-react-ui/styles.css'

export const WalletContextProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const { autoConnect } = useAutoConnect()

  // Use devnet for testing (matches Binance testnet environment)
  const network = (process.env.NEXT_PUBLIC_SOLANA_NETWORK as WalletAdapterNetwork)
    ?? WalletAdapterNetwork.Devnet

  const endpoint = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SOLANA_RPC_URL
    if (url && url.length > 0) return url
    return network === WalletAdapterNetwork.Mainnet
      ? 'https://api.mainnet-beta.solana.com'
      : 'https://api.devnet.solana.com'
  }, [network])

  const wallets = useMemo(() => [
    new PhantomWalletAdapter(),
    new SolflareWalletAdapter({ network }),
  ], [network])

  const onError = useCallback((error: WalletError) => {
    console.error('Wallet error:', error)
    notify({ type: 'error', message: error?.message || 'Wallet error' })
  }, [])

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} onError={onError} autoConnect={autoConnect}>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  )
}

export const ContextProvider: FC<{ children: ReactNode }> = ({ children }) => (
  <AutoConnectProvider>
    <WalletContextProvider>{children}</WalletContextProvider>
  </AutoConnectProvider>
)
