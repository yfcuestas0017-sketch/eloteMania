-- Restablece las contraseñas de los usuarios de ejemplo con hashes bcrypt VÁLIDOS.
-- Ejecútalo en pgAdmin (Query Tool) sobre la base "EloteMania".
-- IMPORTANTE: cambia las contraseñas de abajo por las que quieras usar.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

UPDATE usuarios
SET contrasena_hash = crypt('Admin12345', gen_salt('bf', 10)),
    activo = TRUE
WHERE nombre_usuario = 'admin_user';

UPDATE usuarios
SET contrasena_hash = crypt('Cajero12345', gen_salt('bf', 10)),
    activo = TRUE
WHERE nombre_usuario = 'cajero_user';
