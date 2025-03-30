import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "hardhat-docgen";
import * as dotenv from "dotenv";

dotenv.config();

const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "";
const RPC_URL_SEPOLIA = process.env.RPC_URL_SEPOLIA || "";

const config: HardhatUserConfig = {
  solidity: "0.8.28",
  docgen: {
    path: './docs',
    clear: true,
    runOnCompile: true,
  },
  defaultNetwork: "hardhat",
  networks: {
    sepolia: {
      url: RPC_URL_SEPOLIA,
      chainId: 11155111,
      accounts: [`${PRIVATE_KEY}`]
    }
  },
  etherscan: {
    apiKey: {
      sepolia: ETHERSCAN_API_KEY
    }
  }
};

export default config;
