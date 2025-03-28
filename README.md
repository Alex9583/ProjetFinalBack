# SuperHelper project

Project description soon

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
