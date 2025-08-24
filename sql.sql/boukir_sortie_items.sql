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
-- Table structure for table `sortie_items`
--

DROP TABLE IF EXISTS `sortie_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sortie_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `bon_sortie_id` int NOT NULL,
  `product_id` int NOT NULL,
  `quantite` decimal(10,2) NOT NULL,
  `prix_unitaire` decimal(10,2) NOT NULL,
  `remise_pourcentage` decimal(5,2) DEFAULT '0.00',
  `remise_montant` decimal(10,2) DEFAULT '0.00',
  `total` decimal(10,2) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_si_bon` (`bon_sortie_id`),
  KEY `idx_si_prod` (`product_id`),
  CONSTRAINT `sortie_items_ibfk_1` FOREIGN KEY (`bon_sortie_id`) REFERENCES `bons_sortie` (`id`) ON DELETE CASCADE,
  CONSTRAINT `sortie_items_ibfk_2` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=69 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sortie_items`
--

LOCK TABLES `sortie_items` WRITE;
/*!40000 ALTER TABLE `sortie_items` DISABLE KEYS */;
INSERT INTO `sortie_items` VALUES (20,17,4,1.00,400.00,0.00,0.00,400.00,'2025-08-13 14:09:16'),(23,19,3,1.00,292.50,0.00,0.00,292.50,'2025-08-13 15:18:19'),(32,3,10289,1.00,0.00,0.00,0.00,0.00,'2025-08-14 19:27:33'),(33,3,10200,1.00,237.50,0.00,0.00,237.50,'2025-08-14 19:27:33'),(37,6,10291,1.00,500.00,0.00,0.00,500.00,'2025-08-15 23:54:31'),(43,7,9249,1.00,500.00,0.00,0.00,500.00,'2025-08-16 19:11:51'),(44,7,9790,5.00,2345.00,0.00,0.00,11725.00,'2025-08-16 19:11:51'),(45,7,10331,5.00,5555.56,0.00,0.00,27777.80,'2025-08-16 19:11:51'),(46,8,10331,12.00,220.00,0.00,0.00,2640.00,'2025-08-19 19:18:00'),(56,10,8414,3.00,400.00,0.00,0.00,1200.00,'2025-08-20 18:25:59'),(57,15,8414,1.00,33.48,0.00,10.00,33.48,'2025-08-21 00:48:26'),(58,15,10331,1.00,22.00,0.00,70.00,22.00,'2025-08-21 00:48:26'),(61,16,10336,2.00,41.25,0.00,200.00,82.50,'2025-08-21 00:56:07'),(62,17,8414,44.00,33.48,0.00,0.00,1473.12,'2025-08-21 13:08:44'),(64,9,9851,1.00,200.00,0.00,0.00,200.00,'2025-08-21 13:33:14'),(65,9,8414,2.00,44.00,0.00,0.00,88.00,'2025-08-21 13:33:14'),(66,18,10338,1.00,55.00,0.00,0.00,55.00,'2025-08-21 19:21:29'),(67,18,10333,3.00,55.00,0.00,0.00,165.00,'2025-08-21 19:21:29'),(68,18,10344,44.00,55.00,0.00,0.00,2420.00,'2025-08-21 19:21:29');
/*!40000 ALTER TABLE `sortie_items` ENABLE KEYS */;
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
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`localhost`*/ /*!50003 TRIGGER `trg_si_after_insert_move` AFTER INSERT ON `sortie_items` FOR EACH ROW BEGIN
  IF (SELECT statut FROM bons_sortie WHERE id = NEW.bon_sortie_id) = 'Validé' THEN
    UPDATE products SET quantite = quantite - NEW.quantite
    WHERE id = NEW.product_id;
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
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`localhost`*/ /*!50003 TRIGGER `trg_si_after_update_move` AFTER UPDATE ON `sortie_items` FOR EACH ROW BEGIN
  IF (SELECT statut FROM bons_sortie WHERE id = NEW.bon_sortie_id) = 'Validé' THEN
    IF NEW.product_id = OLD.product_id THEN
      UPDATE products
      SET quantite = quantite - (NEW.quantite - OLD.quantite)
      WHERE id = NEW.product_id;
    ELSE
      UPDATE products SET quantite = quantite + OLD.quantite WHERE id = OLD.product_id;
      UPDATE products SET quantite = quantite - NEW.quantite WHERE id = NEW.product_id;
    END IF;
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
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`localhost`*/ /*!50003 TRIGGER `trg_si_after_delete_restore` AFTER DELETE ON `sortie_items` FOR EACH ROW BEGIN
  IF (SELECT statut FROM bons_sortie WHERE id = OLD.bon_sortie_id) = 'Validé' THEN
    UPDATE products SET quantite = quantite + OLD.quantite
    WHERE id = OLD.product_id;
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
