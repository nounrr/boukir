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
-- Table structure for table `avoirs_client`
--

DROP TABLE IF EXISTS `avoirs_client`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `avoirs_client` (
  `id` int NOT NULL AUTO_INCREMENT,
  `date_creation` date NOT NULL,
  `client_id` int DEFAULT NULL,
  `montant_total` decimal(10,2) NOT NULL,
  `lieu_chargement` varchar(255) DEFAULT NULL,
  `statut` enum('En attente','Validé','Appliqué','Annulé') DEFAULT 'En attente',
  `created_by` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `adresse_livraison` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `client_id` (`client_id`),
  KEY `created_by` (`created_by`),
  CONSTRAINT `avoirs_client_ibfk_1` FOREIGN KEY (`client_id`) REFERENCES `contacts` (`id`) ON DELETE SET NULL,
  CONSTRAINT `avoirs_client_ibfk_2` FOREIGN KEY (`created_by`) REFERENCES `employees` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `avoirs_client`
--

LOCK TABLES `avoirs_client` WRITE;
/*!40000 ALTER TABLE `avoirs_client` DISABLE KEYS */;
INSERT INTO `avoirs_client` VALUES (1,'2025-08-13',13,117.52,'','Validé',1,'2025-08-14 13:33:44','2025-08-16 15:30:40',''),(2,'2025-08-16',441,100.00,'','En attente',1,'2025-08-16 15:46:42','2025-08-16 15:46:42',''),(3,'2025-08-16',441,362.50,'','En attente',1,'2025-08-16 16:29:53','2025-08-16 16:29:53',''),(4,'2025-08-19',431,5555.00,'','En attente',1,'2025-08-19 19:30:20','2025-08-19 19:30:20',''),(5,'2025-08-20',448,100.00,'','En attente',1,'2025-08-20 14:06:35','2025-08-20 14:06:35',''),(6,'2025-08-20',448,400.00,'','En attente',1,'2025-08-20 15:02:17','2025-08-20 15:02:17',''),(7,'2025-08-19',220,200.00,NULL,'En attente',1,'2025-08-21 19:19:25','2025-08-21 19:19:25',''),(8,'2025-08-18',220,82.50,NULL,'En attente',1,'2025-08-21 19:19:54','2025-08-21 19:19:54',''),(11,'2025-08-19',220,2640.00,NULL,'En attente',1,'2025-08-21 19:21:44','2025-08-21 19:21:44',''),(12,'2025-08-20',220,514.69,NULL,'En attente',1,'2025-08-21 19:55:00','2025-08-21 19:55:00','');
/*!40000 ALTER TABLE `avoirs_client` ENABLE KEYS */;
UNLOCK TABLES;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`localhost`*/ /*!50003 TRIGGER `trg_avc_after_update_move_stock` AFTER UPDATE ON `avoirs_client` FOR EACH ROW BEGIN
  -- Validation => entrée en stock
  IF NEW.statut = 'Validé' AND OLD.statut <> 'Validé' THEN
    UPDATE products p
    JOIN (
      SELECT product_id, SUM(quantite) q
      FROM avoir_client_items
      WHERE avoir_client_id = NEW.id
      GROUP BY product_id
    ) x ON x.product_id = p.id
    SET p.quantite = p.quantite + x.q;
  END IF;

  -- Retour depuis Validé => on annule l’entrée
  IF OLD.statut = 'Validé' AND NEW.statut IN ('En attente', 'Appliqué', 'Annulé') THEN
    UPDATE products p
    JOIN (
      SELECT product_id, SUM(quantite) q
      FROM avoir_client_items
      WHERE avoir_client_id = NEW.id
      GROUP BY product_id
    ) x ON x.product_id = p.id
    SET p.quantite = p.quantite - x.q;
  END IF;
END */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`localhost`*/ /*!50003 TRIGGER `trg_avc_after_delete_restore` AFTER DELETE ON `avoirs_client` FOR EACH ROW BEGIN
  -- Si on supprime un avoir validé, on retire ce qu’on avait ajouté
  IF OLD.statut = 'Validé' THEN
    UPDATE products p
    JOIN (
      SELECT product_id, SUM(quantite) q
      FROM avoir_client_items
      WHERE avoir_client_id = OLD.id
      GROUP BY product_id
    ) x ON x.product_id = p.id
    SET p.quantite = p.quantite - x.q;
  END IF;
END */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2025-08-24  1:12:29
