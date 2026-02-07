"use client";

import { useState, useEffect } from "react";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

type Profile = {
  id: string;
  name: string;
  email: string;
  phoneNumber?: string | null;
  countryCode?: string | null;
  bio?: string | null;
};

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

export default function ProfilePage() {
  const [user, setUser] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [country, setCountry] = useState("");
  const [phone, setPhone] = useState("");
  const [bio, setBio] = useState("");
  const [saved, setSaved] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    fetch(`${API_URL}/api/v1/users/profile`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setUser(data);
          setDisplayName(data.name ?? "");
          setEmail(data.email ?? "");
          const parts = (data.name ?? "").trim().split(/\s+/);
          setFirstName(parts[0] ?? "");
          setLastName(parts.slice(1).join(" ") ?? "");
          setCountry(data.countryCode ?? "");
          setPhone(data.phoneNumber ?? "");
          setBio(data.bio ?? "");
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleCancelEdit = () => {
    if (!user) return;
    setDisplayName(user.name ?? "");
    setEmail(user.email ?? "");
    const parts = (user.name ?? "").trim().split(/\s+/);
    setFirstName(parts[0] ?? "");
    setLastName(parts.slice(1).join(" ") ?? "");
    setCountry(user.countryCode ?? "");
    setPhone(user.phoneNumber ?? "");
    setBio(user.bio ?? "");
    setIsEditing(false);
  };

  const handleSave = async () => {
    const token = getToken();
    if (!token || !user) return;
    setSaveError(null);
    try {
      const res = await fetch(`${API_URL}/api/v1/users/profile`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: displayName.trim() || user.name,
          email: email.trim() || user.email,
          phoneNumber: phone.trim() || null,
          countryCode: country || null,
          bio: bio.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSaveError(data.message ?? "Failed to save profile");
        return;
      }
      const updated = (await res.json()) as Profile;
      setUser(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      setIsEditing(false);
    } catch {
      setSaveError("Network error");
    }
  };

  if (loading) {
    return <p className="text-white/90">Loading…</p>;
  }

  if (!user) {
    return <p className="text-white/90">Could not load profile.</p>;
  }

  return (
    <div className="w-full flex flex-col sm:flex-row gap-8 items-start text-left">
      {/* Top left: User summary card */}
      <div className="w-full sm:w-72 shrink-0 text-left ml-4 sm:ml-6">
        <div className="rounded-xl overflow-hidden bg-[#2a2a2a] border border-white/10">
          <div className="h-20 bg-[#3b82f6] flex items-center justify-center">
            <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center text-white text-2xl font-semibold">
              {user.name.charAt(0).toUpperCase()}
            </div>
          </div>
          <div className="p-4 text-left">
            <h3 className="text-lg font-semibold text-white/95 mb-1">
              {user.name}
            </h3>
            <p className="text-sm text-white/60 mb-3">
              {new Date().toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
              {" · "}
              Account
            </p>
            <p className="text-sm text-white/70 leading-relaxed text-left">
              {bio || "Update your bio in the form to see it here."}
            </p>
          </div>
        </div>
      </div>

      {/* Right: Account Setting title + Card (1.4x width: 28rem * 1.4 ≈ 39.2rem) */}
      <div className="w-full min-w-0 flex flex-col gap-10 text-left max-w-[39.2rem]">
        <div className="w-full text-left">
          <h1 className="text-2xl font-semibold text-white/95 mb-1">
            Account Setting
          </h1>
        </div>

        <Card className="w-full border border-white/20 shadow-none bg-[#2a2a2a] text-left py-0 px-0">
          <div className="p-6 flex flex-col gap-6">
            <CardHeader className="px-0 pt-0 pb-0 text-left">
              <CardTitle className="text-xl font-semibold text-white/95">
                General Information
              </CardTitle>
              <CardDescription className="text-white/60">
                Update photo and personal detail here
              </CardDescription>
            </CardHeader>
            <div className="flex flex-col gap-6 text-left">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left">
              <div className="space-y-2 text-left">
                <Label className="text-white/80">First Name</Label>
                <Input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="First name"
                  disabled={!isEditing}
                  readOnly={!isEditing}
                  className="bg-white/10 border-white/20 text-white placeholder:text-white/50 focus-visible:ring-[#4AA336] focus-visible:border-[#4AA336] disabled:opacity-80 disabled:cursor-not-allowed"
                />
              </div>
              <div className="space-y-2 text-left">
                <Label className="text-white/80">Last Name</Label>
                <Input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Last name"
                  disabled={!isEditing}
                  readOnly={!isEditing}
                  className="bg-white/10 border-white/20 text-white placeholder:text-white/50 focus-visible:ring-[#4AA336] focus-visible:border-[#4AA336] disabled:opacity-80 disabled:cursor-not-allowed"
                />
              </div>
            </div>

            <div className="space-y-2 text-left">
              <Label className="text-white/80">Display Name</Label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Display name"
                disabled={!isEditing}
                readOnly={!isEditing}
                className="bg-white/10 border-white/20 text-white placeholder:text-white/50 focus-visible:ring-[#4AA336] focus-visible:border-[#4AA336] disabled:opacity-80 disabled:cursor-not-allowed"
              />
            </div>

            <div className="space-y-2 text-left">
              <Label className="text-white/80">Email</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                disabled={!isEditing}
                readOnly={!isEditing}
                className="bg-white/10 border-white/20 text-white placeholder:text-white/50 focus-visible:ring-[#4AA336] focus-visible:border-[#4AA336] disabled:opacity-80 disabled:cursor-not-allowed"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left">
              <div className="space-y-2 text-left">
                <Label className="text-white/80">Select Country</Label>
                <select
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  disabled={!isEditing}
                  className="flex h-9 w-full rounded-md border border-white/20 bg-white/10 px-3 py-1 text-sm text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-[#4AA336] focus:border-[#4AA336] disabled:opacity-80 disabled:cursor-not-allowed"
                >
                  <option value="">+00</option>
                  <option value="IN">India (+91)</option>
                  <option value="US">United States (+1)</option>
                  <option value="GB">United Kingdom (+44)</option>
                </select>
              </div>
              <div className="space-y-2 text-left">
                <Label className="text-white/80">Phone Number</Label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Phone Number"
                  disabled={!isEditing}
                  readOnly={!isEditing}
                  className="bg-white/10 border-white/20 text-white placeholder:text-white/50 focus-visible:ring-[#4AA336] focus-visible:border-[#4AA336] disabled:opacity-80 disabled:cursor-not-allowed"
                />
              </div>
            </div>

            <div className="space-y-2 text-left">
              <Label className="text-white/80">Bio</Label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Tell us a little about yourself"
                rows={4}
                disabled={!isEditing}
                readOnly={!isEditing}
                className="flex w-full rounded-md border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-[#4AA336] focus:border-[#4AA336] resize-y min-h-[80px] disabled:opacity-80 disabled:cursor-not-allowed"
              />
            </div>
            <div className="flex justify-center">
              {!isEditing ? (
                <Button
                  type="button"
                  onClick={() => {
                    setSaveError(null);
                    setIsEditing(true);
                  }}
                  className="bg-[#4AA336] hover:bg-[#3d8a2e] text-white"
                >
                  Edit Profile
                </Button>
              ) : (
                <div className="flex flex-col gap-2 w-full sm:w-auto">
                  <div className="flex gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleCancelEdit}
                      className="border-white/30 text-white/90 hover:bg-white/10"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      onClick={handleSave}
                      className="bg-[#6366f1] hover:bg-[#4f46e5] text-white"
                    >
                      {saved ? "Saved!" : "Save"}
                    </Button>
                  </div>
                  {saveError && (
                    <p className="text-sm text-red-400">{saveError}</p>
                  )}
                </div>
              )}
            </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
