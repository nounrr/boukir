-- MySQL dump 10.13  Distrib 8.0.43, for Win64 (x86_64)
--
-- Host: 127.0.0.1    Database: boukir
-- ------------------------------------------------------
-- Server version	9.4.0

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `comptant_items`
--

DROP TABLE IF EXISTS `comptant_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `comptant_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `bon_comptant_id` int NOT NULL,
  `product_id` int NOT NULL,
  `quantite` decimal(10,2) NOT NULL,
  `prix_unitaire` decimal(10,2) NOT NULL,
  `remise_pourcentage` decimal(5,2) DEFAULT '0.00',
  `remise_montant` decimal(10,2) DEFAULT '0.00',
  `total` decimal(10,2) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ci_bon` (`bon_comptant_id`),
  KEY `idx_ci_prod` (`product_id`),
  CONSTRAINT `comptant_items_ibfk_1` FOREIGN KEY (`bon_comptant_id`) REFERENCES `bons_comptant` (`id`) ON DELETE CASCADE,
  CONSTRAINT `comptant_items_ibfk_2` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `comptant_items`
--

LOCK TABLES `comptant_items` WRITE;
/*!40000 ALTER TABLE `comptant_items` DISABLE KEYS */;
INSERT INTO `comptant_items` VALUES (2,1,8342,1.00,18.13,0.00,0.00,18.13,'2025-08-13 22:28:49'),(3,2,10163,1.00,225.00,0.00,0.00,225.00,'2025-08-14 15:28:07'),(4,3,7732,13.00,37.50,0.00,0.00,487.50,'2025-08-14 20:35:06'),(6,5,9851,1.00,200.00,0.00,0.00,200.00,'2025-08-15 22:04:38'),(7,6,10224,1.00,100.00,0.00,0.00,100.00,'2025-08-16 16:15:33'),(9,8,10339,22.00,5555.00,0.00,0.00,122210.00,'2025-08-19 19:01:21'),(10,9,8414,22.00,777.00,0.00,0.00,17094.00,'2025-08-19 19:02:40'),(11,10,8414,1.00,777.00,0.00,0.00,777.00,'2025-08-19 19:02:59'),(12,11,9851,1.00,200.00,0.00,0.00,200.00,'2025-08-19 19:31:12'),(14,14,8644,33.00,117.50,0.00,0.00,3877.50,'2025-08-20 18:25:41'),(15,15,10224,2.00,22.00,0.00,0.00,44.00,'2025-08-21 13:08:10');
/*!40000 ALTER TABLE `comptant_items` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2025-08-24  1:12:30
