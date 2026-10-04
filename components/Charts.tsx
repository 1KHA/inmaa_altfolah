"use client"

import {
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts"
import { BarChart as RechartsBarChart, Bar } from "recharts"
import { PieChart as RechartsPieChart, Pie, Cell } from "recharts"
import { useState, useEffect } from "react"

// Default data for when real data is not available
const defaultLineData = [
  { name: "يناير", users: 400 },
  { name: "فبراير", users: 300 },
  { name: "مارس", users: 200 },
  { name: "أبريل", users: 278 },
  { name: "مايو", users: 189 },
  { name: "يونيو", users: 239 },
]

const defaultBarData = [
  { name: "مسار التعليم", count: 4 },
  { name: "مسار الصحة", count: 3 },
  { name: "مسار التقنية", count: 5 },
  { name: "مسار الترفيه", count: 2 },
]

const defaultPieData = [
  { name: "المشاركين في فرق", value: 120 },
  { name: "المشاركين الفرديين", value: 32 },
]

// The identity palette (--chart-1…5 in globals.css), then the deep navy
const COLORS = [1, 2, 3, 4, 5].map((n) => `hsl(var(--chart-${n}))`).concat("hsl(var(--primary-dark))")

interface LineChartProps {
  data?: Array<{ name: string; users: number }>
}

export function LineChart({ data = defaultLineData }: LineChartProps) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <RechartsLineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="name" />
        <YAxis />
        <Tooltip />
        <Legend />
        <Line type="monotone" dataKey="users" stroke="hsl(var(--chart-1))" name="عدد المستخدمين" />
      </RechartsLineChart>
    </ResponsiveContainer>
  )
}

interface BarChartProps {
  data?: Array<{ name: string; count: number }>
}

export function BarChart({ data = defaultBarData }: BarChartProps) {
  const [chartData, setChartData] = useState(data)

  useEffect(() => {
    // Fetch team distribution data from API
    const fetchTeamDistribution = async () => {
      try {
        const response = await fetch("/api/admin/dashboard/stats")
        if (response.ok) {
          const stats = await response.json()
          if (stats.teamDistribution && stats.teamDistribution.length > 0) {
            setChartData(stats.teamDistribution)
          }
        }
      } catch (error) {
        console.error("Error fetching team distribution:", error)
      }
    }

    fetchTeamDistribution()
  }, [])

  return (
    <ResponsiveContainer width="100%" height={300}>
      <RechartsBarChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="name" />
        <YAxis />
        <Tooltip />
        <Legend />
        <Bar dataKey="count" fill="hsl(var(--chart-1))" name="عدد الفرق" />
      </RechartsBarChart>
    </ResponsiveContainer>
  )
}

interface PieChartProps {
  data?: Array<{ name: string; value: number }>
}

export function PieChart({ data = defaultPieData }: PieChartProps) {
  const [chartData, setChartData] = useState(data)

  useEffect(() => {
    // Fetch participant distribution data from API
    const fetchParticipantDistribution = async () => {
      try {
        const response = await fetch("/api/admin/dashboard/stats")
        if (response.ok) {
          const stats = await response.json()
          if (stats.totalParticipants && stats.individualParticipants) {
            const teamParticipants = stats.totalParticipants - stats.individualParticipants
            setChartData([
              { name: "المشاركين في فرق", value: teamParticipants },
              { name: "المشاركين الفرديين", value: stats.individualParticipants }
            ])
          }
        }
      } catch (error) {
        console.error("Error fetching participant distribution:", error)
      }
    }

    fetchParticipantDistribution()
  }, [])

  return (
    <ResponsiveContainer width="100%" height={300}>
      <RechartsPieChart>
        <Pie 
          data={chartData} 
          cx="50%" 
          cy="50%" 
          labelLine={true} 
          outerRadius={80} 
          fill="hsl(var(--chart-1))" 
          dataKey="value"
          label={({ name, percent }) => `${name}: ${percent ? (percent * 100).toFixed(0) : 0}%`}
        >
          {chartData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(value) => [`${value} مشارك`, 'العدد']} />
        <Legend />
      </RechartsPieChart>
    </ResponsiveContainer>
  )
}
