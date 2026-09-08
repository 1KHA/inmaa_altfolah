import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import jwt from 'jsonwebtoken';
import { requireActiveMentor } from '@/lib/account-status';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

interface DecodedToken {
  id: string;
  role: string;
  iat: number;
  exp: number;
}

export async function PUT(request: NextRequest) {
  try {
    const token = request.cookies.get('token')?.value;

    if (!token) {
      return NextResponse.json({ message: 'Authentication token not found' }, { status: 401 });
    }

    const decoded = jwt.verify(token, JWT_SECRET) as DecodedToken;

    if (!decoded || decoded.role !== 'mentor') {
      return NextResponse.json({ message: 'Invalid token or role' }, { status: 403 });
    }
    const blocked_ = await requireActiveMentor(decoded.id);
    if (blocked_) return blocked_;


    const body = await request.json();
    const { name, email, specialty, phone } = body;

    const updatedMentor = await prisma.mentor.update({
      where: { id: decoded.id },
      data: {
        name,
        email,
        specialty,
        phone,
      },
      // never return passwordHash to the client
      select: {
        id: true,
        name: true,
        email: true,
        specialty: true,
        phone: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(updatedMentor);
  } catch (error) {
    console.error('Failed to update mentor profile:', error);
    if (error instanceof jwt.JsonWebTokenError) {
      return NextResponse.json({ message: 'Invalid token' }, { status: 401 });
    }
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
