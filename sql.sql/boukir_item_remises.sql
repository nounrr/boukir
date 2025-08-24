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
-- Table structure for table `item_remises`
--

DROP TABLE IF EXISTS `item_remises`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `item_remises` (
  `id` int NOT NULL AUTO_INCREMENT,
  `client_remise_id` int NOT NULL,
  `product_id` int NOT NULL,
  `bon_id` int DEFAULT NULL,
  `bon_type` enum('Commande','Sortie','Comptant') DEFAULT NULL,
  `is_achat` tinyint(1) NOT NULL DEFAULT '0',
  `qte` int NOT NULL DEFAULT '0',
  `prix_remise` decimal(10,2) NOT NULL DEFAULT '0.00',
  `statut` enum('En attente','Validé','Annulé') NOT NULL DEFAULT 'En attente',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_item_remises_client` (`client_remise_id`),
  KEY `fk_item_remises_product` (`product_id`),
  CONSTRAINT `fk_item_remises_client` FOREIGN KEY (`client_remise_id`) REFERENCES `client_remises` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_item_remises_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `item_remises`
--

LOCK TABLES `item_remises` WRITE;
/*!40000 ALTER TABLE `item_remises` DISABLE KEYS */;
INSERT INTO `item_remises` VALUES (1,1,8414,13,'Sortie',0,2,10.00,'En attente','2025-08-20 17:39:30','2025-08-20 21:11:41'),(2,1,8644,13,'Sortie',0,3,3.00,'En attente','2025-08-20 17:39:30','2025-08-20 21:11:42'),(3,1,10339,14,'Sortie',0,2,5.00,'Annulé','2025-08-20 17:46:31','2025-08-20 21:40:31'),(4,1,10339,NULL,NULL,0,1,0.00,'En attente','2025-08-21 00:28:35','2025-08-21 00:28:35'),(5,1,10339,NULL,NULL,0,1,-400.00,'En attente','2025-08-21 00:47:09','2025-08-21 00:47:09'),(6,1,8414,15,'Sortie',0,1,10.00,'Validé','2025-08-21 00:48:26','2025-08-21 00:48:26'),(7,1,10331,15,'Sortie',0,1,70.00,'Validé','2025-08-21 00:48:26','2025-08-21 00:48:26'),(8,1,10336,16,'Sortie',0,2,100.00,'Validé','2025-08-21 00:49:18','2025-08-21 00:49:18'),(9,1,10336,16,'Sortie',0,2,200.00,'En attente','2025-08-21 00:56:07','2025-08-21 12:47:43');
/*!40000 ALTER TABLE `item_remises` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2025-08-24  1:12:29
