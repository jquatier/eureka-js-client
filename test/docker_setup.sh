docker pull netflixoss/eureka:1.1.147
docker run -d --name eureka -P netflixoss/eureka:1.1.147
docker ps -a
docker port eureka
curl -v http://0.0.0.0:32768/eureka/v2/apps
curl -v http://0.0.0.0:8080/eureka/v2/apps