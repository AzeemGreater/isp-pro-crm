FROM postgres:16-alpine

RUN apk add --no-cache bash

# Enable useful extensions
RUN echo "shared_preload_libraries = 'pg_stat_statements'" >> /usr/local/share/postgresql/postgresql.conf.sample


# PostgreSQL tuning for heavy read/write financial ledgers
RUN echo "max_connections = 200" >> /usr/local/share/postgresql/postgresql.conf.sample && \
    echo "shared_buffers = 256MB" >> /usr/local/share/postgresql/postgresql.conf.sample && \
    echo "effective_cache_size = 768MB" >> /usr/local/share/postgresql/postgresql.conf.sample && \
    echo "maintenance_work_mem = 64MB" >> /usr/local/share/postgresql/postgresql.conf.sample && \
    echo "checkpoint_completion_target = 0.9" >> /usr/local/share/postgresql/postgresql.conf.sample && \
    echo "wal_buffers = 16MB" >> /usr/local/share/postgresql/postgresql.conf.sample && \
    echo "default_statistics_target = 100" >> /usr/local/share/postgresql/postgresql.conf.sample && \
    echo "random_page_cost = 1.1" >> /usr/local/share/postgresql/postgresql.conf.sample && \
    echo "effective_io_concurrency = 200" >> /usr/local/share/postgresql/postgresql.conf.sample && \
    echo "work_mem = 4MB" >> /usr/local/share/postgresql/postgresql.conf.sample && \
    echo "min_wal_size = 1GB" >> /usr/local/share/postgresql/postgresql.conf.sample && \
    echo "max_wal_size = 4GB" >> /usr/local/share/postgresql/postgresql.conf.sample

EXPOSE 5432
