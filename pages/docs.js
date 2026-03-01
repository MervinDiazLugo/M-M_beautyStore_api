// pages/docs.js
import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function Docs() {
  const router = useRouter();
  useEffect(() => { router.replace('/api/swagger'); }, [router]);
  return null;
}
