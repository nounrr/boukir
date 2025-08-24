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
-- Table structure for table `payments`
--

DROP TABLE IF EXISTS `payments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `payments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `numero` varchar(50) DEFAULT NULL,
  `type_paiement` enum('Client','Fournisseur') DEFAULT 'Client',
  `contact_id` int DEFAULT NULL,
  `bon_id` bigint unsigned DEFAULT NULL,
  `montant_total` decimal(12,2) DEFAULT '0.00',
  `mode_paiement` enum('Espèces','Chèque','Traite','Virement') DEFAULT NULL,
  `date_paiement` date DEFAULT NULL,
  `designation` varchar(255) DEFAULT NULL,
  `date_echeance` date DEFAULT NULL,
  `banque` varchar(100) DEFAULT NULL,
  `personnel` varchar(100) DEFAULT NULL,
  `code_reglement` varchar(100) DEFAULT NULL,
  `image_url` varchar(255) DEFAULT NULL,
  `created_by` int DEFAULT NULL,
  `updated_by` int DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `statut` enum('En attente','Validé','Refusé','Annulé') DEFAULT 'En attente',
  `talon_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_payments_contact` (`contact_id`),
  KEY `idx_caisse_talon_id` (`talon_id`),
  CONSTRAINT `fk_caisse_talon` FOREIGN KEY (`talon_id`) REFERENCES `talons` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_payments_contact` FOREIGN KEY (`contact_id`) REFERENCES `contacts` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `payments`
--

LOCK TABLES `payments` WRITE;
/*!40000 ALTER TABLE `payments` DISABLE KEYS */;
INSERT INTO `payments` VALUES (1,'1','Client',13,NULL,50.00,'Chèque','2025-08-14','',NULL,NULL,NULL,NULL,'/uploads/payments/payment-1755178866886-312353212.png',1,1,'2025-08-14 14:41:06','2025-08-15 21:19:57','En attente',NULL),(2,'2','Client',13,NULL,400.00,'Espèces','2025-08-15','',NULL,NULL,NULL,NULL,'',1,1,'2025-08-15 19:32:44','2025-08-15 21:28:31','Refusé',NULL),(3,'3','Client',8,NULL,444.00,'Espèces','2025-08-15','',NULL,NULL,NULL,NULL,'',1,1,'2025-08-15 20:50:48','2025-08-15 22:48:57','Validé',NULL),(4,'4','Client',441,NULL,300.00,'Espèces','2025-08-16','',NULL,NULL,NULL,NULL,'',1,NULL,'2025-08-16 16:44:07','2025-08-16 16:44:07','En attente',NULL),(5,'5','Client',445,9,555.00,'Chèque','2025-08-19','',NULL,NULL,NULL,NULL,'/uploads/payments/payment-1755644408083-405058176.png',1,NULL,'2025-08-20 00:00:08','2025-08-20 00:00:08','En attente',NULL),(6,'6','Client',445,NULL,32.93,'Traite','2025-08-20','','2025-08-21',NULL,NULL,NULL,'/uploads/payments/payment-1755648028836-401300006.png',1,NULL,'2025-08-20 01:00:28','2025-08-20 01:00:28','En attente',NULL),(8,'8','Fournisseur',447,NULL,100.00,'Espèces','2025-08-20','',NULL,NULL,NULL,NULL,'',1,NULL,'2025-08-20 14:34:51','2025-08-20 14:34:51','En attente',NULL),(9,'9','Client',448,NULL,1000.00,'Espèces','2025-08-20','','2025-08-25','BMCE',NULL,NULL,'',1,1,'2025-08-20 14:36:59','2025-08-23 22:49:55','En attente',1),(10,'10','Client',445,17,500.00,'Chèque','2025-08-23','','2025-09-06',NULL,NULL,NULL,'',1,1,'2025-08-23 21:29:19','2025-08-23 22:49:48','En attente',1),(11,'11','Client',445,NULL,900.00,'Espèces','2025-08-23','','2025-08-30',NULL,NULL,NULL,'',1,NULL,'2025-08-23 23:02:38','2025-08-23 23:03:33','Refusé',1);
/*!40000 ALTER TABLE `payments` ENABLE KEYS */;
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
