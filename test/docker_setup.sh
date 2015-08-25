docker pull netflixoss/eureka:1.1.147
docker run -d --name eureka -d netflixoss/eureka:1.1.147
docker ps -a
curl -v 127.0.0.1:8080/eureka/