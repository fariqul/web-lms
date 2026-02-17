import React from 'react';
import clsx from 'clsx';

interface Column<T> {
  key: string;
  header: string;
  render?: (item: T) => React.ReactNode;
  className?: string;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T) => string | number;
  isLoading?: boolean;
  emptyMessage?: string;
  onRowClick?: (item: T) => void;
  className?: string;
}

export function Table<T>({
  columns,
  data,
  keyExtractor,
  isLoading = false,
  emptyMessage = 'Tidak ada data',
  onRowClick,
  className,
}: TableProps<T>) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className={clsx('overflow-x-auto', className)}>
      <table className="min-w-full divide-y divide-border">
        <thead className="bg-muted">
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                className={clsx(
                  'px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider',
                  column.className
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-card divide-y divide-border">
          {data.map((item) => (
            <tr
              key={keyExtractor(item)}
              onClick={() => onRowClick?.(item)}
              className={clsx(
                'hover:bg-muted transition-colors',
                onRowClick && 'cursor-pointer'
              )}
            >
              {columns.map((column) => (
                <td
                  key={`${keyExtractor(item)}-${column.key}`}
                  className={clsx('px-4 py-3 whitespace-nowrap text-sm', column.className)}
                >
                  {column.render
                    ? column.render(item)
                    : (item as Record<string, unknown>)[column.key] as React.ReactNode}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ currentPage, totalPages, onPageChange }: PaginationProps) {
  const pages = [];
  const maxVisiblePages = 5;
  let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
  const endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

  if (endPage - startPage + 1 < maxVisiblePages) {
    startPage = Math.max(1, endPage - maxVisiblePages + 1);
  }

  for (let i = startPage; i <= endPage; i++) {
    pages.push(i);
  }

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t">
      <div className="text-sm text-muted-foreground">
        Halaman {currentPage} dari {totalPages}
      </div>
      <div className="flex gap-1">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="px-3 py-1 text-sm rounded-lg border border-border hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Prev
        </button>
        {pages.map((page) => (
          <button
            key={page}
            onClick={() => onPageChange(page)}
            className={clsx(
              'px-3 py-1 text-sm rounded-lg border transition-colors',
              page === currentPage
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border hover:bg-muted'
            )}
          >
            {page}
          </button>
        ))}
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="px-3 py-1 text-sm rounded-lg border border-border hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
    </div>
  );
}
