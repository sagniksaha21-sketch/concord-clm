import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getPermissions } from '@/app/lib/api';
import Component from '@/components/GuestAdministration';
export const dynamic = 'force-dynamic';
export default async function Page() {
  const token = cookies().get('concord_token')?.value;
  if (!token) redirect('/login');
  const { permissions } = await getPermissions(token);
  if (!permissions.includes('admin')) redirect('/workspace');
  return <Component />;
}
