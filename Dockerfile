FROM ubuntu:latest

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    ca-certificates \
    curl \
    gnupg \
    lsb-release

RUN curl -fsSL https://get.docker.com | bash -

WORKDIR /app

COPY . .

RUN chmod +x start-node.bash

ENTRYPOINT ["./start-node.bash"]