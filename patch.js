const fs = require('fs');

const path = 'frontend/src/App.jsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Add useState right after showSettingsModal
content = content.replace(
  'const [showSettingsModal, setShowSettingsModal] = useState(false);',
  `const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [profileForm, setProfileForm] = useState(null);

  useEffect(() => {
    if (showSettingsModal && me && !profileForm) {
      setProfileForm({
        display_name: me.display_name || "",
        bio: me.bio || "",
        avatar_id: me.avatar_id || 1,
        banner_color: me.banner_color || "#4f46e5"
      });
    }
  }, [showSettingsModal, me, profileForm]);

  const isProfileDirty = profileForm && me && (
    profileForm.display_name !== (me.display_name||"") ||
    profileForm.bio !== (me.bio||"") ||
    profileForm.avatar_id !== (me.avatar_id||1) ||
    profileForm.banner_color !== (me.banner_color||"#4f46e5")
  );`
);

// 2. Replace the Profiles tab rendering with the ID Card and Avatar Grid
const profileTabRegex = /\{\/\*\s*Profiles Tab\s*\*\/\}\s*\{activeSettingsTab === 'profiles' && \([\s\S]*?(?=\{\/\*\s*Restricted Username\s*\*\/)/;

const newProfileTab = `{/* Profiles Tab */}
                  {activeSettingsTab === 'profiles' && (
                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2">
                       {/* ─── Digital ID Card ─── */}
                      <section className="space-y-3">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-white/30 px-1">Network Identity</label>
                        <div className="relative w-full max-w-[400px] rounded-2xl overflow-hidden bg-[#0f0f11] shadow-2xl group border border-white/10 p-6 flex flex-col items-center">
                          <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-transparent pointer-events-none" />
                          
                          {/* Top bar with stylized chip */}
                          <div className="w-full flex justify-between items-center mb-6">
                            <div className="w-8 h-6 rounded-md bg-gradient-to-tr from-[#FFD700] to-[#B8860B] shadow-[0_0_10px_rgba(255,215,0,0.2)] border border-[#DAA520]" />
                            <span className="text-[10px] font-mono font-bold tracking-widest text-indigo-400">CIPHER_NODE // SECURE</span>
                          </div>

                          {/* Avatar Interactive Flip Trigger */}
                          <div className="relative w-28 h-28 mb-4 border-2 border-white/10 rounded-full bg-[#111214] p-1 shadow-[0_0_20px_rgba(0,0,0,0.5)] cursor-pointer group/avatar">
                            <div className="w-full h-full bg-[#1e1f24] rounded-full overflow-hidden flex items-center justify-center transition-transform group-hover/avatar:scale-[1.02]">
                              <CipherMascot className="w-full h-full p-4 text-indigo-400/90" id={profileForm?.avatar_id || me?.avatar_id || 1} />
                            </div>
                            {/* Hover prompt */}
                            <div className="absolute -bottom-2 -right-2 bg-indigo-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full opacity-0 group-hover/avatar:opacity-100 transition-opacity">
                              ACCESS
                            </div>
                          </div>

                          <div className="text-center space-y-1 w-full">
                            <h4 className="text-white font-black text-xl tracking-tight">
                              {profileForm?.display_name || me?.display_name || me?.username}
                            </h4>
                            <p className="text-white/40 font-mono text-xs">@{me?.username}</p>
                          </div>

                          {/* Telemetry Block */}
                          <div className="mt-8 w-full bg-white/[0.02] border border-white/5 rounded-xl p-4 space-y-3">
                            <div className="flex justify-between items-center text-xs">
                              <span className="text-white/30 uppercase font-bold text-[9px] tracking-widest">Node Inception</span>
                              <span className="text-white/80 font-mono">{new Date(me?.created_at || Date.now()).toLocaleDateString()}</span>
                            </div>
                            <div className="flex justify-between items-center text-xs">
                              <span className="text-white/30 uppercase font-bold text-[9px] tracking-widest">Clearance Level</span>
                              <span className="text-indigo-400 font-bold">Standard</span>
                            </div>
                            {profileForm?.bio && (
                              <div className="pt-3 border-t border-white/5 text-left">
                                <span className="text-white/30 uppercase font-bold text-[9px] tracking-widest block mb-1">Bio Data</span>
                                <p className="text-white/60 text-[11px] leading-relaxed">{profileForm.bio}</p>
                              </div>
                            )}
                          </div>

                          {/* Mock Action */}
                          <button className="mt-6 w-full py-3 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 rounded-xl text-xs font-bold uppercase tracking-widest transition-all">
                            Transmit Ping
                          </button>
                        </div>
                      </section>

                      {/* ─── Avatar Selection Grid ─── */}
                      <section className="space-y-3">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-white/30 px-1">Mascot Selection</label>
                        <div className="grid grid-cols-4 md:grid-cols-5 gap-3">
                          {[1,2,3,4,5,6,7,8,9].map(id => (
                            <button 
                              key={id}
                              onClick={() => setProfileForm(p => ({ ...p, avatar_id: id }))}
                              className={\`aspect-square rounded-2xl flex items-center justify-center transition-all duration-300 \${profileForm?.avatar_id === id ? 'bg-indigo-500/20 border-2 border-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.2)]' : 'bg-black/20 border border-white/5 hover:border-white/20'}\`}
                            >
                              <CipherMascot className={\`w-full h-full p-3 \${profileForm?.avatar_id === id ? 'text-indigo-400' : 'text-white/30'}\`} id={id} />
                            </button>
                          ))}
                        </div>
                      </section>

                      <div className="space-y-6 pt-4 border-t border-white/5">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                          {/* Display Name */}
                          <section className="space-y-3">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-white/30 px-1">Display Name</label>
                            <input 
                              className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-indigo-500/50 transition-all font-medium" 
                              placeholder="Type a display name..."
                              value={profileForm?.display_name ?? ''} 
                              onChange={(e) => setProfileForm(p => ({ ...p, display_name: e.target.value }))}
                            />
                            <p className="text-[10px] text-white/20 px-1">This is how you appear to others. Supports spaces and emojis.</p>
                          </section>

                          {/* Bio */}
                          <section className="space-y-3">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-white/30 px-1">About Me</label>
                            <input 
                              className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-indigo-500/50 transition-all font-medium" 
                              placeholder="Type your bio..."
                              value={profileForm?.bio ?? ''} 
                              onChange={(e) => setProfileForm(p => ({ ...p, bio: e.target.value }))}
                            />
                          </section>
                        </div>

`;

content = content.replace(profileTabRegex, newProfileTab);

// 3. Remove the old bio textarea block which was duplicate 
const oldBioRegex = /<section className="space-y-3">\s*<label className="text-\[10px\] font-bold uppercase tracking-widest text-white\/30 px-1">About Me<\/label>\s*<textarea[\s\S]*?<\/section>/;
content = content.replace(oldBioRegex, "");

// 4. Inject the Save Protocol Floating bar right before the Settings Modal closing div
const saveProtocolBar = `
            {isProfileDirty && (
              <div className="absolute bottom-0 left-0 right-0 p-4 bg-[#111214]/90 backdrop-blur-xl border-t border-white/10 z-50 flex items-center justify-between md:left-64 animate-in slide-in-from-bottom-2">
                <span className="text-sm text-indigo-400 font-bold uppercase tracking-widest">Unsaved Telemetry Tracked</span>
                <div className="flex gap-3">
                  <button onClick={() => setProfileForm({
                      display_name: me.display_name || "",
                      bio: me.bio || "",
                      avatar_id: me.avatar_id || 1,
                      banner_color: me.banner_color || "#4f46e5"
                    })} className="px-4 py-2 hover:bg-white/5 text-white/50 rounded-lg text-xs font-bold uppercase tracking-widest transition-colors">Reset</button>
                  <button onClick={async () => {
                    await handleUpdateProfile(profileForm);
                  }} className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2 rounded-lg text-xs font-bold uppercase tracking-widest shadow-lg shadow-indigo-500/20 transition-all">Save Protocol</button>
                </div>
              </div>
            )}
          </div>
        </div>
`;

content = content.replace('          </div>\n        </div>\n      )}\n    </div>', saveProtocolBar + '      )}\n    </div>');

fs.writeFileSync(path, content, 'utf8');
console.log("Patch applied!");
