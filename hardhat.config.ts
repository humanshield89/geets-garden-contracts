import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@openzeppelin/hardhat-upgrades";
import dotenv from "dotenv";
import "@nomicfoundation/hardhat-verify";

dotenv.config();

const deployer_privateKey = process.env.DEPLOYER_PRIVATE_KEY as string;

const config: HardhatUserConfig = {
  sourcify: {
    enabled: true,
  },
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  gasReporter: {
    currency: "USD",
    enabled: true,
    coinmarketcap: "1dd853ef-ffd9-4c3f-81f3-416e91789d00",
    gasPrice: 12,
    // outputFile: "gas-report.txt",
  },
  etherscan: {
    apiKey: {
      base: "TGNZRF5XY7JSQN8FYR8XZEYYFQ8KAUUMRP",
      avax: "avax", // apiKey is not required, just set a placeholder
    },
    customChains: [
      {
        network: "avax",
        chainId: 43114,
        urls: {
          apiURL:
            "https://api.routescan.io/v2/network/mainnet/evm/43114/etherscan",
          browserURL: "https://avalanche.routescan.io",
        },
      },
    ],
  },
  networks: {
    hardhat: {
      /*
      forking: {
        url: "https://mainnet-rpc.areon.network/",
      },
      /*
      gasPrice: 0,
      initialBaseFeePerGas: 0,
      gas: 12000000,
      blockGasLimit: 0x1fffffffffffff,
      allowUnlimitedContractSize: true,
      
      forking: {
        url: "https://mainnet.base.org",
        blockNumber: 13734270,
      },*/
      /*
      forking: {
        url:
          "https://go.getblock.io/a669dcb5b12f445eb9e8e9534be766b0" ||
          "https://polygon-mainnet.g.alchemy.com/v2/_uouIS4G3cF5wfmLRxrIn-pXf_KqYCv6",
        blockNumber: 38314344,
      },
      */
    },
    local: {
      url: "http://127.0.0.1:8545/",
      accounts: [deployer_privateKey],
    },
    areon: {
      url: "https://mainnet-rpc.areon.network/",
      accounts: [deployer_privateKey],
    },
    sepolia: {
      url: "https://rpc2.sepolia.org",
      accounts: [deployer_privateKey],
    },
    main: {
      url: "https://mainnet.infura.io/v3/cc2302cb7a6e41cbbee885bb07f770e6",
      accounts: [deployer_privateKey],
    },
    bsc: {
      url: "https://bsc-dataseed.binance.org/",
      accounts: [deployer_privateKey],
    },
    avax: {
      url: "https://api.avax.network/ext/bc/C/rpc",
      accounts: [deployer_privateKey],
    },
    polygon: {
      url: "https://polygon-mainnet.g.alchemy.com/v2/alcht_VL4wIEsEEYePzPGlK4p5LrWzFBJdcK",
      accounts: [deployer_privateKey],
    },
    pulse: {
      url: "https://rpc.pulsechain.com",
      accounts: [deployer_privateKey],
    },
    arbitrum: {
      url: "https://rpc.ankr.com/arbitrum",
      accounts: [deployer_privateKey],
    },
    base: {
      url: "https://rpc.ankr.com/base",
      accounts: [deployer_privateKey],
    },
    blast: {
      url: "https://rpc.blast.io",
      accounts: [deployer_privateKey],
    },
  },
};

export default config;
