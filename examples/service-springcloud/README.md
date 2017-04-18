# Spring Cloud Netflix with Node Js and Express example

## Usage

First, start your eureka:

```shell
docker run -it -p 8761:8761 springcloud/eureka
```

and then:

```shell
npm install
npm run service
```

to debug:

```shell
NODE_DEBUG=request npm run service
```

