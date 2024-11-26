#!/usr/bin/env bash

set -eu

NITRO_NODE_VERSION=offchainlabs/nitro-node:v3.2.1-d81324d-dev
L1_NODE_URL=http://l1-node:8545

# This commit matches v2.1.0 release of nitro-contracts, with additional support to set arb owner through upgrade executor
DEFAULT_NITRO_CONTRACTS_VERSION="99c07a7db2fcce75b751c5a2bd4936e898cda065"
DEFAULT_TOKEN_BRIDGE_VERSION="v1.2.2"

# Set default versions if not overriden by provided env vars
: ${NITRO_CONTRACTS_BRANCH:=$DEFAULT_NITRO_CONTRACTS_VERSION}
: ${TOKEN_BRIDGE_BRANCH:=$DEFAULT_TOKEN_BRIDGE_VERSION}
export NITRO_CONTRACTS_BRANCH
export TOKEN_BRIDGE_BRANCH

echo "Using NITRO_CONTRACTS_BRANCH: $NITRO_CONTRACTS_BRANCH"
echo "Using TOKEN_BRIDGE_BRANCH: $TOKEN_BRIDGE_BRANCH"

mydir=`dirname $0`
cd "$mydir"

# Run 'scripts' commands
if [[ $# -gt 0 ]] && [[ $1 == "script" ]]; then
    shift
    docker compose run scripts "$@"
    exit $?
fi

# force initializes if volumes are not present
num_volumes=`docker volume ls --filter label=com.docker.compose.project=nitro-testnode -q | wc -l`

if [[ $num_volumes -eq 0 ]]; then
    force_init=true
else
    force_init=false
fi

run=true
ci=false
detach=false
nowait=false
tokenbridge=true
ownerPrivKey=59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
l1chainid=31337
simple=true

# Rebuild docker images
build_dev_nitro=false
build_utils=false
force_build_utils=false
build_node_images=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --init)
            if ! $force_init; then
                echo == Warning! this will remove all previous data
                read -p "are you sure? [y/n]" -n 1 response
                if [[ $response == "y" ]] || [[ $response == "Y" ]]; then
                    force_init=true
                    echo
                else
                    exit 0
                fi
            fi
            build_utils=true
            build_node_images=true
            shift
            ;;
        --init-force)
            force_init=true
            build_utils=true
            build_node_images=true
            shift
            ;;
        --ci)
            ci=true
            shift
            ;;
        --build)
            build_dev_nitro=true
            build_utils=true
            build_node_images=true
            shift
            ;;
        --no-build)
            build_dev_nitro=false
            build_utils=false
            build_node_images=false
            shift
            ;;
        --build-dev-nitro)
            build_dev_nitro=true
            shift
            ;;
        --no-build-dev-nitro)
            build_dev_nitro=false
            shift
            ;;
        --build-utils)
            build_utils=true
            shift
            ;;
        --no-build-utils)
            build_utils=false
            shift
            ;;
        --force-build-utils)
            force_build_utils=true
            shift
            ;;
        --tokenbridge)
            tokenbridge=true
            shift
            ;;
        --no-tokenbridge)
            tokenbridge=false
            shift
            ;;
        --no-run)
            run=false
            shift
            ;;
        --detach)
            detach=true
            shift
            ;;
        --nowait)
            if ! $detach; then
                echo "Error: --nowait requires --detach to be provided."
                exit 1
            fi
            nowait=true
            shift
            ;;
        *)
            echo Usage: $0 \[OPTIONS..]
            echo        $0 script [SCRIPT-ARGS]
            echo
            echo OPTIONS:
            echo --build           rebuild docker images
            echo --no-build        don\'t rebuild docker images
            echo --init            remove all data, rebuild, deploy new rollup
            echo --detach          detach from nodes after running them
            echo --tokenbridge     deploy L1-L2 token bridge.
            echo --no-tokenbridge  don\'t build or launch tokenbridge
            echo --no-run          does not launch nodes \(useful with build or init\)
            echo --build-dev-nitro     rebuild dev nitro docker image
            echo --no-build-dev-nitro  don\'t rebuild dev nitro docker image
            echo --build-utils         rebuild scripts, rollupcreator, token bridge docker images
            echo --no-build-utils      don\'t rebuild scripts, rollupcreator, token bridge docker images
            echo --force-build-utils   force rebuilding utils, useful if NITRO_CONTRACTS_ or TOKEN_BRIDGE_BRANCH changes
            echo
            echo script runs inside a separate docker. For SCRIPT-ARGS, run $0 script --help
            exit 0
    esac
done


NODES="sequencer"
INITIAL_SEQ_NODES="sequencer"

if $build_utils; then
  LOCAL_BUILD_NODES="scripts rollupcreator"
  # always build tokenbridge in CI mode to avoid caching issues
  if $tokenbridge || $ci; then
    LOCAL_BUILD_NODES="$LOCAL_BUILD_NODES tokenbridge"
  fi

  if [ "$ci" == true ]; then
    # workaround to cache docker layers and keep using docker-compose in CI
    docker buildx bake --file docker-compose.yaml --file docker-compose-ci-cache.json $LOCAL_BUILD_NODES
  else
    UTILS_NOCACHE=""
    if $force_build_utils; then
      UTILS_NOCACHE="--no-cache"
    fi
    docker compose build --no-rm $UTILS_NOCACHE $LOCAL_BUILD_NODES
  fi
fi

docker pull $NITRO_NODE_VERSION
docker tag $NITRO_NODE_VERSION nitro-node-dev-testnode

if $build_node_images; then
    docker compose build --no-rm $NODES
fi

if $force_init; then
    echo == Removing old data..
    docker compose down
    leftoverContainers=`docker container ls -a --filter label=com.docker.compose.project=nitro-testnode -q | xargs echo`
    if [ `echo $leftoverContainers | wc -w` -gt 0 ]; then
        docker rm $leftoverContainers
    fi
    docker volume prune -f --filter label=com.docker.compose.project=nitro-testnode
    leftoverVolumes=`docker volume ls --filter label=com.docker.compose.project=nitro-testnode -q | xargs echo`
    if [ `echo $leftoverVolumes | wc -w` -gt 0 ]; then
        docker volume rm $leftoverVolumes
    fi

    echo == Generating l1 keys
    docker compose run scripts write-accounts

    echo == Waiting for l1-node to sync
    docker compose run scripts wait-for-sync --url $L1_NODE_URL

    echo == Funding funnel
    docker compose run scripts mint-eth --ethamount 100 --to funnel --wait

    echo == Funding validator, sequencer and l2owner
    docker compose run scripts send-l1 --ethamount 10 --to validator --wait
    docker compose run scripts send-l1 --ethamount 10 --to sequencer --wait
    docker compose run scripts send-l1 --ethamount 10 --to l2owner --wait

    echo == create l1 traffic
    docker compose run scripts send-l1 --ethamount 10 --to user_l1user --wait
    docker compose run scripts send-l1 --ethamount 0.0001 --from user_l1user --to user_l1user_b --wait --delay 500 --times 1000000 > /dev/null &

    l2ownerAddress=`docker compose run scripts print-address --account l2owner | tail -n 1 | tr -d '\r\n'`

    echo == Writing l2 chain config
    docker compose run scripts --l2owner $l2ownerAddress  write-l2-chain-config

    sequenceraddress=`docker compose run scripts print-address --account sequencer | tail -n 1 | tr -d '\r\n'`
    l2ownerKey=`docker compose run scripts print-private-key --account l2owner | tail -n 1 | tr -d '\r\n'`
    wasmroot=`docker compose run --entrypoint sh sequencer -c "cat /home/user/target/machines/latest/module-root.txt"`

    echo == Deploying L2 chain
    docker compose run -e PARENT_CHAIN_RPC=$L1_NODE_URL -e DEPLOYER_PRIVKEY=$l2ownerKey -e PARENT_CHAIN_ID=$l1chainid -e CHILD_CHAIN_NAME="arb-dev-test" -e MAX_DATA_SIZE=117964 -e OWNER_ADDRESS=$l2ownerAddress -e WASM_MODULE_ROOT=$wasmroot -e SEQUENCER_ADDRESS=$sequenceraddress -e AUTHORIZE_VALIDATORS=10 -e CHILD_CHAIN_CONFIG_PATH="/config/l2_chain_config.json" -e CHAIN_DEPLOYMENT_INFO="/config/deployment.json" -e CHILD_CHAIN_INFO="/config/deployed_chain_info.json" rollupcreator create-rollup-testnode
    docker compose run --entrypoint sh rollupcreator -c "jq [.[]] /config/deployed_chain_info.json > /config/l2_chain_info.json"

    if $simple; then
        echo == Writing configs
        docker compose run scripts write-config --simple
    fi

    echo == Funding l2 funnel and dev key
    docker compose up --wait $INITIAL_SEQ_NODES
    docker compose run scripts bridge-funds --ethamount 200 --wait
    docker compose run scripts send-l2 --ethamount 50 --to l2owner --wait

    if $tokenbridge; then
        echo == Deploying L1-L2 token bridge
        sleep 10 # no idea why this sleep is needed but without it the deploy fails randomly
        rollupAddress=`docker compose run --entrypoint sh poster -c "jq -r '.[0].rollup.rollup' /config/deployed_chain_info.json | tail -n 1 | tr -d '\r\n'"`
        docker compose run -e ROLLUP_OWNER_KEY=$l2ownerKey -e ROLLUP_ADDRESS=$rollupAddress -e PARENT_KEY=$ownerPrivKey -e PARENT_RPC=$L1_NODE_URL -e CHILD_KEY=$ownerPrivKey -e CHILD_RPC=http://sequencer:8547 tokenbridge deploy:local:token-bridge
        docker compose run --entrypoint sh tokenbridge -c "cat network.json && cp network.json l1l2_network.json && cp network.json localNetwork.json"
        echo
    fi

    echo == Deploy CacheManager on L2
    docker compose run -e CHILD_CHAIN_RPC="http://sequencer:8547" -e CHAIN_OWNER_PRIVKEY=$l2ownerKey rollupcreator deploy-cachemanager-testnode
fi

if $run; then
    UP_FLAG=""
    if $detach; then
        if $nowait; then
            UP_FLAG="--detach"
        else
            UP_FLAG="--wait"
        fi
    fi

    echo == Launching Sequencer
    echo if things go wrong - use --init to create a new chain
    echo

    docker compose up $UP_FLAG $NODES
fi
