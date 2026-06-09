FROM freeradius/freeradius-server:latest

# Install PostgreSQL client libraries for rlm_sql_postgresql
USER root
RUN apt-get update -qq && \
    apt-get install -y -qq libpq-dev postgresql-client && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Copy our SQL module configuration
COPY mods-available/sql /etc/freeradius/3.0/mods-available/sql
COPY mods-enabled/sql   /etc/freeradius/3.0/mods-enabled/sql
COPY sites-enabled/default /etc/freeradius/3.0/sites-enabled/default



EXPOSE 1812/udp 1813/udp

USER freerad
CMD ["freeradius", "-X"]
