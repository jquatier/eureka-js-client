docker pull netflixoss/eureka:1.1.147
docker run -d --name eureka -P netflixoss/eureka:1.1.147
docker ps -a
docker port eureka
curl -v http://localhost:39657/eureka/
curl -v http://localhost:8080/eureka/