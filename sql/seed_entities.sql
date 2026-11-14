-- Ejecutar después de supabase_schema.sql. Crea fichas vacías de trabajo para las entidades cartográficas.
insert into public.entity_fiches (geo_id, entity_type, name, period, published) values
('TER-0001','territorio','Atacama','Siglo XVII',false),
('TER-0002','territorio','Cabildo de Jujuy','Siglo XVII',false),
('TER-0003','territorio','Lipes','Siglo XVII',false),
('TER-0004','territorio','Tarija','Siglo XVII',false),
('TER-0005','territorio','Chichas','Siglo XVII',false),
('TER-0006','territorio','Porco','Siglo XVII',false),
('TER-0007','territorio','Potosi','Siglo XVII',false),
('TER-0008','territorio','Yamparaes','Siglo XVII',false),
('POD-0001','poder','Gob Tucuman','Siglo XVII',false),
('POD-0002','poder','Espacio de poder 2','Siglo XVII',false),
('POD-0003','poder','Espacio de poder 3','Siglo XVII',false)
on conflict (geo_id) do nothing;
