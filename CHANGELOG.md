# Mi Solar V6.10.0

- Sesión persistente por 24 horas.
- Expiración deslizante basada exclusivamente en actividad real del usuario.
- Cierre automático tras 24 horas sin clics, toques, teclado, desplazamiento o regreso a la pestaña.
- Las consultas automáticas del inversor no prolongan artificialmente la sesión.
- Nueva ruta segura `POST /api/activity` para renovar la sesión.
- Cookie ampliada a 24 horas y versión visible actualizada.

# Changelog

## 6.9.0

- Histórico diario dividido en tramos de 6 horas hasta el momento actual.
- Paginación corregida cuando `total` anuncia más registros aunque falte `hasNextPage`.
- Unión y deduplicación de todas las páginas y tramos.
- Mensaje visible con la hora de la última muestra cargada.
- Actualización manual vuelve a completar el día.
- Nubes más realistas y separadas de la luna.
- Versión visible actualizada a v6.9.0.
