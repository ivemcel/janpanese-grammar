import GrammarPlanner from "@/components/grammar-planner";
import { getGrammarData } from "@/lib/grammar-data";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const data = await getGrammarData();
  const authConfigured = isSupabaseConfigured();
  let userEmail: string | null = null;
  let userId: string | null = null;

  if (authConfigured) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    userEmail = user?.email ?? null;
    userId = user?.id ?? null;
  }

  return (
    <GrammarPlanner
      authConfigured={authConfigured}
      initialData={data}
      userEmail={userEmail}
      userId={userId}
    />
  );
}
