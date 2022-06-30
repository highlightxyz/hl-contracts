# Deploying Contracts to Live Network

Follow `README.md` until "Setup". This guide is for deploying to live networks. For deploying to a local network, loosely follow the items in `README.md`. 

### Deploying to Testnet

Set the env var `POLYGON_NETWORK` to be "mumbai".
Move on to General Deployment.

### Deploying to Mainnet

Set the env var `POLYGON_NETWORK` to be "mainnet".
Move on to General Deployment.

## General Deployment

Follow each of the subheadings below in order.

### Compile contracts 

Run `yarn compile` 

### Set signing private key

Deploying contracts and signing transactions with a keystore file is currently/temporarily unsupported. 
This means you must set the env var `USING_KEYSTORE` to be "0", its default.
The env var `HIGHLIGHT_PRIVATE_KEY` must be set to the private key of the account you want to deploy contracts and sign permissioned transactions with.

### Configure Bundlr

Configure bundlr if you plan to post token metadata on Arweave. This corresponds to the command `yarn mint:new:store`. Skip this section otherwise.

Choose between arweave and matic as currencies to fund your bundlr account with.
Set `METADATA_STORAGE_FUND_CURRENCY` to either "arweave" or "matic". Follow instructions in `sample.env` / `.env` to set the recommended value for `METADATA_STORAGE_FUND_RUNNING_BALANCE` in correspondence to the set value for 
`METADATA_STORAGE_FUND_CURRENCY`. If your chosen currency is arweave, the scripts will expect a `arweave-private-key.json` file in your root directory - this is your Arweave json web keyfile.

If this is your first time deploying, it is likely that your bundlr account isn't funded. You can use the CLI to fund your chosen account (if matic, then the account associated with your signing private key. if arweave, then the account associated with your json web keyfile): https://docs.bundlr.network/docs/client/cli. You may have to wait up to an hour. Once you've funded your bundlr account once, the code will keep a running balance, ensuring your bundlr account is always well funded - this means every time you run `yarn mint:new:store` you will pay with the currency you chose. You can always withdraw your funds from your bundlr account.

### Set better JSON-RPC urls

The `.env` / `sample.env` file's default values for `POLYGON_TESTNET_URL` and `POLYGON_MAINNET_URL` are public rpc urls. It is ***highly*** recommended that you change these to private rpc urls. You can retrieve these by constructing accounts on services that provide hosted polygon nodes. Examples are https://www.alchemy.com/ and https://maticvigil.com/.  