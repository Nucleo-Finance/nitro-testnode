FROM node:18-bullseye-slim
RUN apt-get update && \
    apt-get install -y git docker.io python3 make gcc g++ curl jq
ARG TOKEN_BRIDGE_BRANCH=main
WORKDIR /workspace  
RUN git clone --depth 1 -b v1.2.2 https://github.com/OffchainLabs/token-bridge-contracts.git ./ && \
    rm -rf .git && \
    git init && git add . && git -c user.name="user" -c user.email="user@example.com" commit -m "Initial commit"
    
RUN yarn install && yarn cache clean
RUN yarn build
ENTRYPOINT ["yarn"]
