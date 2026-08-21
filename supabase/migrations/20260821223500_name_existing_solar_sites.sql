-- Sustituye nombres técnicos históricos por nombres de instalación. Se usan
-- solo sufijos parciales para no versionar números de serie completos.
update public.solar_sites set name='El Arrayán' where right(device_sn,4)='0972' and name=device_sn;
update public.solar_sites set name='Puerto Montt' where right(device_sn,4)='8828' and name=device_sn;
