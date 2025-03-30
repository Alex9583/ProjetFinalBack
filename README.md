# SuperHelper project

**SuperHelper** is a decentralized application allowing registered users to:
- Receive an initial allocation of `HELP` tokens upon registration.
- Post job offers specifying token-based rewards.
- Accept jobs posted by other users.
- Complete tasks and receive payments in custom ERC20 `HELP` tokens.
- Rate the quality of completed jobs via a star-rating system.
- Earn visual recognition badges (Bronze, Silver, Gold), reflecting their activity and reliability within the platform.

The platform utilizes its custom ERC20 token (`HELP`) to facilitate interactions between users.


### Project Setup

1. **Clone the repository**

```bash
git clone <repository-url>
cd <repository-name>
```

2. **Install dependencies**

```bash
npm install
```

3. **Configure environment**
   Create a `.env` file at the root and set up your environment variables:

```env
PRIVATE_KEY=your_wallet_private_key
RPC_URL_SEPOLIA=your_rpc_url_to_sepolia
ETHERSCAN_API_KEY=your_etherscan_api_key
```

### Smart Contract Details

- **Name**: HELPER
- **Symbol**: HELP
- **Decimals**: 2
- **Initial Supply**: 1,000,000,000 HELP

### Deploying the Contract

Deploy using Hardhat:

```bash
npx hardhat ignition deploy ignition/modules/SuperHelper.ts --network <network_name> [--verify]
```

Example network names:
- Local development: `localhost`
- Ethereum testnet: `sepolia`

### Test coverage

| File              | % Stmts | % Branch  | % Funcs | % Lines | Uncovered Lines |
|-------------------|---------|-----------|---------|---------|-----------------|
| contracts/        | 100     | 92.31     | 100     | 100     |                 |
| HelperToken.sol   | 100     | 100       | 100     | 100     |                 |
| SuperHelper.sol   | 100     | 92.31     | 100     | 100     |                 |
| **All files**     | **100** | **92.31** | **100** | **100** |                 |