# Deprecated

This protocol is no longer in use, see hl-evm-contracts for v1.

# Environment Setup

### Install [nvm](https://github.com/nvm-sh/nvm)
```
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
```

### Install and use the correct version of node, yarn, and dependencies
```
nvm install 14.17
nvm use 14.17
npm install yarn
yarn install
```

### Configure environment
```
cp sample.env .env
```

# Setup

This project uses the `.env` file to determine network, signers, private keys, and more. `sample.env` is pre-configured for a local ethereum instance. 
Advanced users can modify the `.env` to interact with / deploy contracts on testnet/mainnet. 

### Start a local hardhat network
```
yarn local
```

### Compile contracts and generate ABIs
```
yarn compile
```

Compiled artifacts will be saved in the `artifacts/` directory. ABIs for each contract can be found
under the `contracts` subdirectory, with the locations of the json artifacts for each contract mirroring 
their locations in `contracts/`.

This command will need to be run after freshly pulling the repository and after pulling in changes to the contracts.

### Tests

To run tests: 

```
yarn test
```

To generate test coverage:

```
yarn coverage
```

### Linter

Diagnostic: 

```
yarn lint
```

Fixing with linter:

```
yarn lint:fix
```
