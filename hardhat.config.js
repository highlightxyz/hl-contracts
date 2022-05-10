require("@nomiclabs/hardhat-waffle");
require('hardhat-contract-sizer');
require('@nomiclabs/hardhat-solhint');
require('@openzeppelin/hardhat-upgrades');
require('solidity-coverage');
require('dotenv').config();

module.exports = {
  defaultNetwork: process.env.POLYGON_NETWORK,
  networks: {
    hardhat: {
      chainId: 1337,
      mining: {
        auto: process.env.AUTO_MINING_ON === "true",
        interval: 1000
      }
    },
    mumbai: {
      url: process.env.POLYGON_TESTNET_URL,
      accounts: [process.env.HIGHLIGHT_PRIVATE_KEY]
    }, 
    mainnet: {
      url: process.env.POLYGON_MAINNET_URL,
      accounts: [process.env.HIGHLIGHT_PRIVATE_KEY]
    }
  },
  contractSizer: {
    alphaSort: true,
    runOnCompile: true,
    disambiguatePaths: false,
  },
  solidity: {
    version: "0.8.10",
    settings: {
      optimizer: {
        enabled: true
      },
    },
  },
};


