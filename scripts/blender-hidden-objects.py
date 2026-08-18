import bpy, json

out = []
vl = bpy.context.view_layer
vl_objects = set(o.name for o in vl.objects)

def collection_chain_hidden(ob):
    """True if any collection containing ob is hidden in render or excluded."""
    hidden = []
    for coll in ob.users_collection:
        if coll.hide_render: hidden.append('coll_render:' + coll.name)
        if coll.hide_viewport: hidden.append('coll_viewport:' + coll.name)
    # layer-collection exclusion
    def walk(lc):
        for child in lc.children:
            if child.exclude or child.hide_viewport:
                for o in child.collection.all_objects:
                    if o.name == ob.name:
                        hidden.append('layer:' + child.name + (':excluded' if child.exclude else ':hidden'))
            walk(child)
    walk(vl.layer_collection)
    return hidden

for ob in bpy.data.objects:
    if ob.type not in ('MESH', 'EMPTY', 'CURVE'): continue
    eye = None
    if ob.name in vl_objects:
        try: eye = ob.hide_get()
        except Exception: eye = None
    colls = collection_chain_hidden(ob)
    if ob.hide_viewport or ob.hide_render or eye or colls:
        out.append({
            'name': ob.name, 'type': ob.type,
            'eye_hidden': eye,
            'hide_viewport': ob.hide_viewport,
            'hide_render': ob.hide_render,
            'collections': colls,
        })

print('===HIDDEN_START===')
print(json.dumps(out, indent=1))
print('===HIDDEN_END===')
