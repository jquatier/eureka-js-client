docker pull netflixoss/eureka:1.1.147
docker run -d --name eureka -p 8080:39657 netflixoss/eureka:1.1.147
docker ps -a
docker-machine ip default
curl -v http://localhost:39657/eureka/
curl -v http://localhost:8080/eureka/