-- План 23: с какого дня начислять плату после возобновления (дни приостановки не оплачиваются).
ALTER TABLE tenants ADD COLUMN billing_from date;
