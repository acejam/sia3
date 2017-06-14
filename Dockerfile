FROM ubuntu
RUN apt-get update && apt-get install -yq git npm wget unzip
RUN npm install -g n
RUN n stable

RUN npm install babel-cli@6.10.1 -g --save
RUN mkdir -p /usr/src/sia3
WORKDIR /usr/src/sia3

COPY package.json /usr/src/app/
RUN npm install --production
COPY . /usr/src/sia3

RUN mkdir -p /opt/siad/

RUN wget https://github.com/NebulousLabs/Sia/releases/download/v1.2.2/Sia-v1.2.2-linux-amd64.zip && \
    unzip Sia-v1.2.2-linux-amd64.zip && \
    rm Sia-v1.2.2-linux-amd64.zip && \
    mv Sia-v1.2.2-linux-amd64/* /opt/siad/

# COPY Sia-v1.2.2-linux-amd64/ /opt/siad/
RUN cd /opt/siad/
RUN ./siad &

WORKDIR /usr/src/sia3
EXPOSE  8080
CMD ["npm", "start"]