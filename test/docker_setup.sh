docker pull netflixoss/eureka:1.1.147
docker run -d -net=host --name eureka -P netflixoss/eureka:1.1.147
docker ps -a
docker port eureka
curl -v http://localhost:32768/eureka/v2/apps
curl -v http://localhost:8080/eureka/v2/apps