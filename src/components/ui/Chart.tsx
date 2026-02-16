'use client';

import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

interface ChartData {
  [key: string]: string | number;
}

interface BarChartProps {
  data: ChartData[];
  dataKey: string;
  xAxisKey?: string;
  color?: string;
  height?: number;
  showGrid?: boolean;
  showLegend?: boolean;
}

export function SimpleBarChart({
  data,
  dataKey,
  xAxisKey = 'name',
  color = '#3B82F6',
  height = 300,
  showGrid = true,
  showLegend = false,
}: BarChartProps) {
  const isDark = typeof window !== 'undefined' && document.documentElement.classList.contains('dark');
  const gridColor = isDark ? 'rgba(148,163,184,0.08)' : 'rgba(226,232,240,0.6)';
  const tooltipBg = isDark ? '#1e293b' : '#FFF';
  const tooltipBorder = isDark ? '#334155' : '#E5E7EB';

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        {showGrid && <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />}
        <XAxis
          dataKey={xAxisKey}
          tick={{ fill: '#6B7280', fontSize: 12 }}
          axisLine={{ stroke: gridColor }}
          tickLine={false}
        />
        <YAxis tick={{ fill: '#6B7280', fontSize: 12 }} axisLine={false} tickLine={false} />
        <Tooltip
          contentStyle={{
            backgroundColor: tooltipBg,
            border: `1px solid ${tooltipBorder}`,
            borderRadius: '12px',
            boxShadow: '0 8px 24px -4px rgba(0, 0, 0, 0.12)',
            padding: '8px 12px',
          }}
        />
        {showLegend && <Legend />}
        <Bar dataKey={dataKey} fill={color} radius={[6, 6, 0, 0]} animationDuration={800} animationEasing="ease-out" />
      </BarChart>
    </ResponsiveContainer>
  );
}

interface MultiBarChartProps {
  data: ChartData[];
  bars: { dataKey: string; color: string; name?: string }[];
  xAxisKey?: string;
  height?: number;
}

export function MultiBarChart({
  data,
  bars,
  xAxisKey = 'name',
  height = 300,
}: MultiBarChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(226,232,240,0.5)" vertical={false} />
        <XAxis
          dataKey={xAxisKey}
          tick={{ fill: '#6B7280', fontSize: 12 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis tick={{ fill: '#6B7280', fontSize: 12 }} axisLine={false} tickLine={false} />
        <Tooltip
          contentStyle={{
            backgroundColor: '#FFF',
            border: '1px solid #E5E7EB',
            borderRadius: '12px',
            boxShadow: '0 8px 24px -4px rgba(0, 0, 0, 0.12)',
          }}
        />
        <Legend />
        {bars.map((bar) => (
          <Bar
            key={bar.dataKey}
            dataKey={bar.dataKey}
            name={bar.name || bar.dataKey}
            fill={bar.color}
            radius={[6, 6, 0, 0]}
            animationDuration={800}
            animationEasing="ease-out"
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

interface LineChartProps {
  data: ChartData[];
  lines: { dataKey: string; color: string; name?: string }[];
  xAxisKey?: string;
  height?: number;
}

export function SimpleLineChart({
  data,
  lines,
  xAxisKey = 'name',
  height = 300,
}: LineChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(226,232,240,0.5)" vertical={false} />
        <XAxis
          dataKey={xAxisKey}
          tick={{ fill: '#6B7280', fontSize: 12 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis tick={{ fill: '#6B7280', fontSize: 12 }} axisLine={false} tickLine={false} />
        <Tooltip
          contentStyle={{
            backgroundColor: '#FFF',
            border: '1px solid #E5E7EB',
            borderRadius: '12px',
            boxShadow: '0 8px 24px -4px rgba(0, 0, 0, 0.12)',
          }}
        />
        <Legend />
        {lines.map((line) => (
          <Line
            key={line.dataKey}
            type="monotone"
            dataKey={line.dataKey}
            name={line.name || line.dataKey}
            stroke={line.color}
            strokeWidth={2}
            dot={{ fill: line.color, strokeWidth: 2, r: 4 }}
            activeDot={{ r: 6 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

interface PieChartProps {
  data: { name: string; value: number; color: string }[];
  height?: number;
  innerRadius?: number;
  showLabel?: boolean;
}

export function SimplePieChart({
  data,
  height = 300,
  innerRadius = 0,
  showLabel = true,
}: PieChartProps) {
  const renderLabel = showLabel 
    ? ({ name, percent }: { name?: string; percent?: number }) => 
        `${name || ''} ${((percent || 0) * 100).toFixed(0)}%` 
    : undefined;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={innerRadius}
          outerRadius={80}
          paddingAngle={2}
          dataKey="value"
          label={renderLabel}
          labelLine={showLabel}
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            backgroundColor: '#FFF',
            border: '1px solid #E5E7EB',
            borderRadius: '12px',
            boxShadow: '0 8px 24px -4px rgba(0, 0, 0, 0.12)',
          }}
        />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}

// Attendance Chart Component
interface AttendanceChartData {
  day: string;
  hadir: number;
  izin: number;
  sakit: number;
  alpha: number;
}

interface AttendanceChartProps {
  data: AttendanceChartData[];
  height?: number;
}

export function AttendanceChart({ data, height = 300 }: AttendanceChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(226,232,240,0.5)" vertical={false} />
        <XAxis
          dataKey="day"
          tick={{ fill: '#6B7280', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis tick={{ fill: '#6B7280', fontSize: 12 }} axisLine={false} tickLine={false} />
        <Tooltip
          contentStyle={{
            backgroundColor: '#FFF',
            border: '1px solid #E5E7EB',
            borderRadius: '12px',
            boxShadow: '0 8px 24px -4px rgba(0, 0, 0, 0.12)',
          }}
        />
        <Legend wrapperStyle={{ fontSize: '12px' }} />
        <Bar dataKey="hadir" name="Hadir" fill="#22C55E" radius={[6, 6, 0, 0]} animationDuration={800} animationEasing="ease-out" />
        <Bar dataKey="izin" name="Izin" fill="#3B82F6" radius={[6, 6, 0, 0]} animationDuration={800} animationEasing="ease-out" />
        <Bar dataKey="sakit" name="Sakit" fill="#F59E0B" radius={[6, 6, 0, 0]} animationDuration={800} animationEasing="ease-out" />
        <Bar dataKey="alpha" name="Alpha" fill="#EF4444" radius={[6, 6, 0, 0]} animationDuration={800} animationEasing="ease-out" />
      </BarChart>
    </ResponsiveContainer>
  );
}
