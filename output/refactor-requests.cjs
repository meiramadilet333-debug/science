const fs=require('node:fs');
const p='artifacts/scientific-navigator/src/pages/';
for (const [name,coll,setter,store,key,get,active,update,busy] of [
 ['works','articleDrafts','setArticleDrafts','articleStore','ARTICLE_DRAFTS_KEY','getArticleDrafts','article','updateArticle','isPreparing'],
 ['publications','publicationDrafts','setPublicationDrafts','publicationStore','PUBLICATION_PREP_KEY','getPublicationPrepDrafts','active','updateActive','isAnalyzing']
]) {
 let s=fs.readFileSync(p+name+'.tsx','utf8');
 s="import { usePersistedCollection } from '@/hooks/use-persisted-collection';\nimport { useDocumentRequest, sameRevision } from '@/hooks/use-document-request';\nimport { "+store+" } from '@/features/research/shared';\n"+s;
 s=s.replace(`  const [${coll}, ${setter}] = useState<${name==='works'?'ArticleDraft':'PublicationPrepDraft'}[]>([]);\n`,'');
 s=s.replace("  const [storageError, setStorageError] = useState('');",`  const [storageError, setStorageError] = useState('');\n  const [${coll}, ${setter}] = usePersistedCollection(${store}, setStorageError);`);
 const saveStart=s.indexOf('  useEffect(() => {\n    if (!loaded) return;');
 const saveEnd=s.indexOf(`  const ${active} =`,saveStart);
 s=s.slice(0,saveStart)+s.slice(saveEnd);
 const activeLineEnd=s.indexOf('\n',s.indexOf(`  const ${active} =`));
 s=s.slice(0,activeLineEnd)+`\n  const request = useDocumentRequest(activeId, ${active}?.revision ?? 0);\n  useEffect(() => { ${name==='works'?"setIsPreparing(false); setBusySectionId('');":"setIsAnalyzing(false);"} }, [activeId, ${active}?.revision]);`+s.slice(activeLineEnd);
 if(name==='works') {
  s=s.replace("    if (!activeId) return;\n    setArticleDrafts", "    if (!activeId) return;\n    request.cancel();\n    setArticleDrafts");
  s=s.replace('{ ...item, ...update, savedAt: Date.now() }','{ ...item, ...update, revision: (item.revision ?? 0) + 1, savedAt: Date.now() }');
  s=s.replace("    setIsPreparing(true);", "    const attempt = request.begin();\n    setIsPreparing(true);");
  s=s.replace("    setBusySectionId(section.id);", "    const attempt = request.begin();\n    setBusySectionId(section.id);");
  s=s.replace("sourceIds: article.sourceIds.slice(0, 8),\n      });", "sourceIds: article.sourceIds.slice(0, 8),\n      }, { signal: attempt.signal });");
  s=s.replace("      updateArticle({ plan, structureApproved: false, sectionGuidance: {} });", "      if (!attempt.isCurrent()) return;\n      setArticleDrafts(current => current.map(item => sameRevision(item, attempt.expected) ? { ...item, plan, structureApproved: false, sectionGuidance: {}, savedAt: Date.now(), revision: (item.revision ?? 0) + 1 } : item));");
  s=s.replace("      updateArticle({\n        sectionGuidance: { ...article.sectionGuidance, [section.id]: guidance },\n      });", "      if (!attempt.isCurrent()) return;\n      setArticleDrafts(current => current.map(item => sameRevision(item, attempt.expected) ? { ...item, sectionGuidance: { ...item.sectionGuidance, [section.id]: guidance }, savedAt: Date.now(), revision: (item.revision ?? 0) + 1 } : item));");
  s=s.replaceAll("    } catch (requestError) {\n      setError(","    } catch (requestError) {\n      if (!attempt.isCurrent()) return;\n      setError(");
  s=s.replace("      setIsPreparing(false);", "      if (attempt.isCurrent()) setIsPreparing(false);").replace("      setBusySectionId('');", "      if (attempt.isCurrent()) setBusySectionId('');");
 } else {
  s=s.replace("    if (!activeId) return;\n    setPublicationDrafts", "    if (!activeId) return;\n    request.cancel();\n    setPublicationDrafts");
  s=s.replace("          savedAt: Date.now(),", "          savedAt: Date.now(),\n          revision: (item.revision ?? 0) + 1,");
  s=s.replace("    setIsAnalyzing(true);", "    const attempt = request.begin();\n    setIsAnalyzing(true);");
  s=s.replace("requirementsText: active.requirementsText.trim(),\n      });", "requirementsText: active.requirementsText.trim(),\n      }, { signal: attempt.signal });");
  s=s.replace("      updateActive({ result, checkedItemIds: [] });", "      if (!attempt.isCurrent()) return;\n      setPublicationDrafts(current => current.map(item => sameRevision(item, attempt.expected) ? { ...item, result, checkedItemIds: [], savedAt: Date.now(), revision: (item.revision ?? 0) + 1 } : item));");
  s=s.replace("    } catch (requestError) {\n      setError(", "    } catch (requestError) {\n      if (!attempt.isCurrent()) return;\n      setError(");
  s=s.replace("      setIsAnalyzing(false);", "      if (attempt.isCurrent()) setIsAnalyzing(false);");
 }
 fs.writeFileSync(p+name+'.tsx',s);
}
