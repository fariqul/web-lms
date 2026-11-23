FROM mysql:8.0

# Bind-mounting custom.cnf from a Windows host makes it world-writable, and MySQL
# silently ignores world-writable config files. Bake it in so it is always applied.
COPY custom.cnf /etc/mysql/conf.d/custom.cnf
RUN chmod 644 /etc/mysql/conf.d/custom.cnf
