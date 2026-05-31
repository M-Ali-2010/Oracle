# 🚀 Oracle-Pro — Full-Stack Web3 Платформа

### Solana Wallet + ICO Dashboard + Binance AI Trading

Oracle-Pro — это полнофункциональная Web3-платформа, объединяющая работу с сетью Solana, ICO-панель управления, криптовалютный портфель и модуль алгоритмической торговли через Binance Testnet.

---

# 📌 Возможности проекта

## 💳 Solana Wallet

- Подключение Phantom и Solflare
- Отображение баланса SOL
- Отправка и получение SOL
- Devnet Airdrop
- История транзакций
- Управление SPL-токенами

## 🚀 ICO Dashboard

- Покупка токенов ICO
- Управление инвестициями
- Отслеживание портфеля
- Статистика прибыли и убытков (P&L)
- Работа с несколькими активными проектами

## 🔄 Jupiter Integration

- Обмен SOL на любые SPL-токены
- Получение актуальных курсов
- Быстрые свопы внутри приложения

## 🤖 Binance AI Trading

- Получение рыночных данных Binance Testnet
- Анализ торговых сигналов
- Автоматическая торговля
- Управление рисками
- Технические индикаторы
- Логирование торговых операций

---

# 🏗 Архитектура проекта

text Frontend (Next.js :3000)         ↓ Backend (NestJS :4000)         ↓ Binance Testnet API 

---

# 📂 Структура проекта

text project-root/ │ ├── frontend/ │   ├── components/ │   ├── views/ │   ├── contexts/ │   ├── pages/ │   └── lib/ │ ├── backend/ │   ├── binance/ │   ├── trading/ │   ├── common/ │   └── app.module.ts │ └── README.md 

---

# ⚙️ Технологии

### Frontend

- Next.js 13
- React
- TypeScript
- Tailwind CSS
- Solana Wallet Adapter

### Backend

- NestJS
- TypeScript
- Binance REST API
- HMAC SHA256 Authentication

### Blockchain

- Solana Devnet
- SPL Tokens
- Jupiter Aggregator

### Trading

- Binance Testnet
- RSI
- MACD
- EMA
- Автоматические торговые сигналы

---

# 📈 Торговая стратегия

Используется комбинация популярных технических индикаторов.

### BUY

- RSI < 30
- Цена выше EMA50

### SELL

- RSI > 70
- Или отрицательный MACD

### HOLD

- Во всех остальных случаях

Система рассчитывает уровень уверенности сигнала от 50% до 100%.

---

# 🔥 Возможности Trading Dashboard

- Live цена актива
- Изменение цены за 24 часа
- Выбор торговой пары
- Выбор таймфрейма
- Индикаторы RSI / MACD / EMA
- AI-анализ рынка
- Автоматическое выставление ордеров
- Управление Stop Loss
- Управление Take Profit
- Журнал торговых операций

---

# 🌐 API Endpoints

## Binance

http GET /api/binance/ticker/:symbol 

Получение текущей цены и статистики.

http GET /api/binance/candles/:symbol 

Получение свечей OHLCV.

http GET /api/binance/balance 

Получение баланса Binance Testnet.

---

## Trading

http GET /api/trading/signal 

Получение торгового сигнала.

http POST /api/trading/execute 

Выполнение сделки.

---

# 🚀 Запуск проекта

## Backend

bash cd backend  npm install  npm run start:dev 

Сервер будет доступен по адресу:

text http://localhost:4000 

---

## Frontend

bash cd frontend  npm install  npm run dev 

Приложение будет доступно по адресу:

text http://localhost:3000 

---

# 🔐 Переменные окружения

## Backend

env PORT=4000  BINANCE_API_KEY=YOUR_API_KEY  BINANCE_SECRET_KEY=YOUR_SECRET_KEY  BINANCE_TESTNET=true  DEFAULT_SYMBOL=BTCUSDT  DEFAULT_TIMEFRAME=15m 

---

## Frontend

env NEXT_PUBLIC_API_URL=http://localhost:4000  NEXT_PUBLIC_SOLANA_NETWORK=devnet  NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com 

---

# 🛡 Основные возможности

✅ Solana Wallet

✅ SPL Token Management

✅ ICO Platform

✅ Binance Integration

✅ AI Trading Signals

✅ Auto Trading

✅ Portfolio Analytics

✅ Transaction History

✅ Risk Management

✅ Full-Stack Architecture

---

# 👨‍💻 Автор

Muhammad Ali Zhurakhanov

Full Stack Mobile & Web Developer

📍 Tashkent, Uzbekistan

GitHub: https://github.com/M-Ali-2010

---

# 📄 Лицензия

Данный проект создан в образовательных и демонстрационных целях и может использоваться как основа для дальнейшей разработки Web3, FinTech и Trading-платфор# Oracle
