import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

const DEV_AUTH_BYPASS = process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS === 'true';
const DEV_MOCK_USER_ID = '00000000-0000-0000-0000-000000000001';

interface ResolveApiUserOptions {
  requestedUserId?: string | null;
  allowAnonymous?: boolean;
}

interface ResolveApiUserResult {
  userId: string | null;
  status?: number;
  error?: string;
  isDevBypass: boolean;
}

/**
 * Resolve the authenticated user for API routes and enforce request/user consistency.
 */
export async function resolveApiUser(
  request: NextRequest,
  options: ResolveApiUserOptions = {}
): Promise<ResolveApiUserResult> {
  const { requestedUserId, allowAnonymous = false } = options;

  try {
    const supabase = await createServerSupabase();
    const { data, error } = await supabase.auth.getUser();

    if (!error && data.user) {
      if (requestedUserId && requestedUserId !== data.user.id) {
        return {
          userId: null,
          status: 403,
          error: 'Forbidden: user mismatch',
          isDevBypass: false,
        };
      }

      return {
        userId: data.user.id,
        isDevBypass: false,
      };
    }
  } catch {
    // Fall through to dev bypass/anonymous handling
  }

  if (DEV_AUTH_BYPASS) {
    return {
      userId: requestedUserId || DEV_MOCK_USER_ID,
      isDevBypass: true,
    };
  }

  if (allowAnonymous) {
    return {
      userId: null,
      isDevBypass: false,
    };
  }

  return {
    userId: null,
    status: 401,
    error: 'Unauthorized',
    isDevBypass: false,
  };
}

export function authErrorResponse(result: ResolveApiUserResult) {
  return NextResponse.json(
    { error: result.error || 'Unauthorized' },
    { status: result.status || 401 }
  );
}
