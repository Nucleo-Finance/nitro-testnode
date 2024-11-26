import * as fs from 'fs';
import * as consts from './consts'
import { namedAccount, namedAddress } from './accounts'

const path = require("path");

function writePrysmConfig(argv: any) {
    const prysm = `
CONFIG_NAME: interop
PRESET_BASE: interop

# Genesis
GENESIS_FORK_VERSION: 0x20000089

# Altair
ALTAIR_FORK_EPOCH: 0
ALTAIR_FORK_VERSION: 0x20000090

# Merge
BELLATRIX_FORK_EPOCH: 0
BELLATRIX_FORK_VERSION: 0x20000091
TERMINAL_TOTAL_DIFFICULTY: 50

# Capella
CAPELLA_FORK_EPOCH: 0
CAPELLA_FORK_VERSION: 0x20000092
MAX_WITHDRAWALS_PER_PAYLOAD: 16

# DENEB
DENEB_FORK_EPOCH: 0
DENEB_FORK_VERSION: 0x20000093

# ELECTRA
ELECTRA_FORK_VERSION: 0x20000094

# Time parameters
SECONDS_PER_SLOT: 2
SLOTS_PER_EPOCH: 6

# Deposit contract
DEPOSIT_CONTRACT_ADDRESS: 0x4242424242424242424242424242424242424242
    `
    fs.writeFileSync(path.join(consts.configpath, "prysm.yaml"), prysm)
}

function writeConfigs(argv: any) {
    const valJwtSecret = path.join(consts.configpath, "val_jwt.hex")
    const chainInfoFile = path.join(consts.configpath, "l2_chain_info.json")
    const baseConfig = {
        "parent-chain": {
            "connection": {
                "url": argv.l1url,
            },
        },
        "chain": {
            "id": 412346,
            "info-files": [chainInfoFile],
        },
        "node": {
            "staker": {
                "dangerous": {
                    "without-block-validator": false
                },
                "parent-chain-wallet" : {
                    "account": namedAddress("validator"),
                    "password": consts.l1passphrase,
                    "pathname": consts.l1keystore,    
                },
                "disable-challenge": false,
                "enable": false,
                "staker-interval": "10s",
                "make-assertion-interval": "10s",
                "strategy": "MakeNodes",
            },
            "sequencer": false,
            "dangerous": {
                "no-sequencer-coordinator": false,
                "disable-blob-reader": true,
            },
            "delayed-sequencer": {
                "enable": false
            },
            "seq-coordinator": {
                "enable": false,
                "redis-url": argv.redisUrl,
                "lockout-duration": "30s",
                "lockout-spare": "1s",
                "my-url": "",
                "retry-interval": "0.5s",
                "seq-num-duration": "24h0m0s",
                "update-interval": "3s",
            },
            "batch-poster": {
                "enable": false,
                "redis-url": argv.redisUrl,
                "max-delay": "30s",
                "l1-block-bound": "ignore",
                "parent-chain-wallet" : {
                    "account": namedAddress("sequencer"),
                    "password": consts.l1passphrase,
                    "pathname": consts.l1keystore,    
                },
                "data-poster": {
                    "redis-signer": {
                        "signing-key": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
                    },
                    "wait-for-l1-finality": false
                }
            },
            "block-validator": {
                "validation-server": {
                    "url": argv.validationNodeUrl,
                    "jwtsecret": valJwtSecret,
                }
            }
        },
        "execution": {
            "sequencer": {
                "enable": false,
            },
            "forwarding-target": "null",
        },
        "persistent": {
            "chain": "local"
        },
        "ws": {
            "addr": "0.0.0.0"
        },
        "http": {
            "addr": "0.0.0.0",
            "vhosts": "*",
            "corsdomain": "*"
        },
    }


    const baseConfJSON = JSON.stringify(baseConfig)

    if (argv.simple) {
        let simpleConfig = JSON.parse(baseConfJSON)
        simpleConfig.node.staker.enable = true
        simpleConfig.node.staker["use-smart-contract-wallet"] = true
        simpleConfig.node.staker.dangerous["without-block-validator"] = true
        simpleConfig.node.sequencer = true
        simpleConfig.node.dangerous["no-sequencer-coordinator"] = true
        simpleConfig.node["delayed-sequencer"].enable = true
        simpleConfig.node["batch-poster"].enable = true
        simpleConfig.node["batch-poster"]["redis-url"] = ""
        simpleConfig.execution["sequencer"].enable = true
        fs.writeFileSync(path.join(consts.configpath, "sequencer_config.json"), JSON.stringify(simpleConfig))
    } else {
        let validatorConfig = JSON.parse(baseConfJSON)
        validatorConfig.node.staker.enable = true
        validatorConfig.node.staker["use-smart-contract-wallet"] = true
        let validconfJSON = JSON.stringify(validatorConfig)
        fs.writeFileSync(path.join(consts.configpath, "validator_config.json"), validconfJSON)

        let unsafeStakerConfig = JSON.parse(validconfJSON)
        unsafeStakerConfig.node.staker.dangerous["without-block-validator"] = true
        fs.writeFileSync(path.join(consts.configpath, "unsafe_staker_config.json"), JSON.stringify(unsafeStakerConfig))

        let sequencerConfig = JSON.parse(baseConfJSON)
        sequencerConfig.node.sequencer = true
        sequencerConfig.node["seq-coordinator"].enable = true
        sequencerConfig.execution["sequencer"].enable = true
        sequencerConfig.node["delayed-sequencer"].enable = true
        fs.writeFileSync(path.join(consts.configpath, "sequencer_config.json"), JSON.stringify(sequencerConfig))

        let posterConfig = JSON.parse(baseConfJSON)
        posterConfig.node["seq-coordinator"].enable = true
        posterConfig.node["batch-poster"].enable = true
        fs.writeFileSync(path.join(consts.configpath, "poster_config.json"), JSON.stringify(posterConfig))
    }

    let l3Config = JSON.parse(baseConfJSON)
    l3Config["parent-chain"].connection.url = argv.l2url
    l3Config.node.staker["parent-chain-wallet"].account = namedAddress("l3owner")
    l3Config.node["batch-poster"]["parent-chain-wallet"].account = namedAddress("l3sequencer")
    l3Config.chain.id = 333333
    const l3ChainInfoFile = path.join(consts.configpath, "l3_chain_info.json")
    l3Config.chain["info-files"] = [l3ChainInfoFile]
    l3Config.node.staker.enable = true
    l3Config.node.staker["use-smart-contract-wallet"] = true
    l3Config.node.sequencer = true
    l3Config.execution["sequencer"].enable = true
    l3Config.node["dangerous"]["no-sequencer-coordinator"] = true
    l3Config.node["delayed-sequencer"].enable = true
    l3Config.node["delayed-sequencer"]["finalize-distance"] = 0
    l3Config.node["delayed-sequencer"]["use-merge-finality"] = false
    l3Config.node["batch-poster"].enable = true
    l3Config.node["batch-poster"]["redis-url"] = ""
    fs.writeFileSync(path.join(consts.configpath, "l3node_config.json"), JSON.stringify(l3Config))

    let validationNodeConfig = JSON.parse(JSON.stringify({
        "persistent": {
            "chain": "local"
        },
        "ws": {
            "addr": "",
        },
        "http": {
            "addr": "",
        },
        "validation": {
            "api-auth": true,
            "api-public": false,
        },
        "auth": {
            "jwtsecret": valJwtSecret,
            "addr": "0.0.0.0",
        },
    }))
    fs.writeFileSync(path.join(consts.configpath, "validation_node_config.json"), JSON.stringify(validationNodeConfig))
}

function writeL2ChainConfig(argv: any) {
    const l2ChainConfig = {
        "chainId": 412346,
        "homesteadBlock": 0,
        "daoForkSupport": true,
        "eip150Block": 0,
        "eip150Hash": "0x0000000000000000000000000000000000000000000000000000000000000000",
        "eip155Block": 0,
        "eip158Block": 0,
        "byzantiumBlock": 0,
        "constantinopleBlock": 0,
        "petersburgBlock": 0,
        "istanbulBlock": 0,
        "muirGlacierBlock": 0,
        "berlinBlock": 0,
        "londonBlock": 0,
        "clique": {
            "period": 0,
            "epoch": 0
        },
        "arbitrum": {
            "EnableArbOS": true,
            "AllowDebugPrecompiles": true,
            "DataAvailabilityCommittee": false,
            "InitialArbOSVersion": 32,
            "InitialChainOwner": argv.l2owner,
            "GenesisBlockNum": 0
        }
    }
    const l2ChainConfigJSON = JSON.stringify(l2ChainConfig)
    fs.writeFileSync(path.join(consts.configpath, "l2_chain_config.json"), l2ChainConfigJSON)
}

function writeL3ChainConfig(argv: any) {
    const l3ChainConfig = {
        "chainId": 333333,
        "homesteadBlock": 0,
        "daoForkSupport": true,
        "eip150Block": 0,
        "eip150Hash": "0x0000000000000000000000000000000000000000000000000000000000000000",
        "eip155Block": 0,
        "eip158Block": 0,
        "byzantiumBlock": 0,
        "constantinopleBlock": 0,
        "petersburgBlock": 0,
        "istanbulBlock": 0,
        "muirGlacierBlock": 0,
        "berlinBlock": 0,
        "londonBlock": 0,
        "clique": {
            "period": 0,
            "epoch": 0
        },
        "arbitrum": {
            "EnableArbOS": true,
            "AllowDebugPrecompiles": true,
            "DataAvailabilityCommittee": false,
            "InitialArbOSVersion": 31,
            "InitialChainOwner": argv.l2owner,
            "GenesisBlockNum": 0
        }
    }
    const l3ChainConfigJSON = JSON.stringify(l3ChainConfig)
    fs.writeFileSync(path.join(consts.configpath, "l3_chain_config.json"), l3ChainConfigJSON)
}

export const writeConfigCommand = {
    command: "write-config",
    describe: "writes config files",
    builder: {
        simple: {
          boolean: true,
          describe: "simple config (sequencer is also poster, validator)",
          default: false,
        },
      },    
    handler: (argv: any) => {
        writeConfigs(argv)
    }
}

export const writePrysmCommand = {
    command: "write-prysm-config",
    describe: "writes prysm config files",
    handler: (argv: any) => {
        writePrysmConfig(argv)
    }
}


export const writeL2ChainConfigCommand = {
    command: "write-l2-chain-config",
    describe: "writes l2 chain config file",
    handler: (argv: any) => {
        writeL2ChainConfig(argv)
    }
}

export const writeL3ChainConfigCommand = {
    command: "write-l3-chain-config",
    describe: "writes l3 chain config file",
    handler: (argv: any) => {
        writeL3ChainConfig(argv)
    }
}
