package nl.narvie.mytag;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.*;
import android.text.InputFilter;
import android.text.InputType;
import android.view.*;
import android.widget.*;
import org.maplibre.android.MapLibre;
import org.maplibre.android.maps.*;
import org.maplibre.android.annotations.MarkerOptions;
import org.maplibre.android.camera.CameraUpdateFactory;
import org.maplibre.android.geometry.LatLng;
import java.text.DateFormat;
import java.util.*;

public final class MainActivity extends Activity {
    private static final int GREEN=Color.rgb(23,61,54),CREAM=Color.rgb(247,247,240),MUTED=Color.rgb(95,107,102);
    private TagStore store;
    private BleTracker ble;
    private CloudClient cloud;
    private LinearLayout root,mapPage,mapCard,nav;
    private FrameLayout content;
    private MapView mapView;
    private MapLibreMap map;
    private boolean mapReady,adding,own,foreground;
    private String selected,detailSerial,tab="Kaart",draftName="Mijn tracker";
    private int draftIcon;
    private Runnable permissionAction;
    @Override public void onCreate(Bundle state){
        super.onCreate(state);MapLibre.getInstance(this);store=new TagStore(this);ble=new BleTracker(this,store);cloud=new CloudClient();
        ble.changed=()->{if(foreground)render();};cloud.changed=()->{if(foreground){render();updateMap();}};
        getWindow().setStatusBarColor(GREEN);getWindow().setNavigationBarColor(CREAM);
        root=vertical();root.setBackgroundColor(CREAM);
        root.setOnApplyWindowInsetsListener((view,insets)->{view.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());return insets;});
        LinearLayout header=new LinearLayout(this);header.setGravity(Gravity.CENTER_VERTICAL);header.setPadding(dp(20),dp(10),dp(12),dp(10));
        TextView title=text("narvie.",29,GREEN);title.setTypeface(null,Typeface.BOLD);header.addView(title,new LinearLayout.LayoutParams(0,-2,1));
        Button add=button("+ Toevoegen",()->{adding=true;own=false;tab="Mijn trackers";render();});header.addView(add);
        root.addView(header);content=new FrameLayout(this);root.addView(content,new LinearLayout.LayoutParams(-1,0,1));
        nav=new LinearLayout(this);nav.setPadding(dp(8),dp(4),dp(8),dp(4));root.addView(nav);setContentView(root);
        createMap(state);render();
    }
    private void createMap(Bundle state){
        mapPage=vertical();mapView=new MapView(this);mapView.onCreate(state);mapPage.addView(mapView,new LinearLayout.LayoutParams(-1,0,1));
        ScrollView cardScroll=new ScrollView(this);mapCard=vertical();mapCard.setPadding(dp(20),dp(14),dp(20),dp(12));mapCard.setBackground(background(Color.WHITE,24));cardScroll.addView(mapCard);
        mapPage.addView(cardScroll,new LinearLayout.LayoutParams(-1,dp(Math.min(340,Math.max(230,getResources().getDisplayMetrics().heightPixels/getResources().getDisplayMetrics().density*0.45f)))));
        mapView.addOnDidFailLoadingMapListener(error->{mapReady=false;if(foreground)renderMapCard();});
        mapView.getMapAsync(loaded->{map=loaded;map.getUiSettings().setAttributionEnabled(true);map.moveCamera(CameraUpdateFactory.newLatLngZoom(new LatLng(52.2,5.3),6));
            map.setStyle("https://tiles.openfreemap.org/styles/liberty",style->{mapReady=true;updateMap();if(foreground)renderMapCard();});});
    }
    private String selectedSerial(){if(selected!=null && (store.find(selected)!=null || selected.equals(cloud.serial)))return selected;return store.tags.isEmpty()?cloud.serial:store.tags.get(0).sn;}
    private TagStore.Tag selectedTag(){return store.find(selectedSerial());}
    private String selectedName(){TagStore.Tag t=selectedTag();return t!=null?t.name:cloud.name!=null?cloud.name:"Mijn tracker";}
    private void render(){
        nav.removeAllViews();for(String title:new String[]{"Kaart","Mijn trackers","Hulp"}){Button b=button(title,()->{tab=title;adding=false;detailSerial=null;render();});if(tab.equals(title)){b.setTextColor(Color.WHITE);b.setBackground(background(GREEN,20));}nav.addView(b,new LinearLayout.LayoutParams(0,dp(52),1));}
        content.removeAllViews();if(tab.equals("Kaart")){content.addView(mapPage);renderMapCard();}
        else if(tab.equals("Hulp"))help();else if(adding)addPage();else if(detailSerial!=null && store.find(detailSerial)!=null)details(store.find(detailSerial));else trackers();
    }
    private void renderMapCard(){
        mapCard.removeAllViews();TagStore.Tag t=selectedTag();String sn=selectedSerial();CloudClient.Observation observation=cloud.forSerial(sn);
        heading(mapCard,selectedName());label(mapCard,ble.ready && Objects.equals(ble.serial,sn)?"Dichtbij · Bluetooth verbonden":"Bluetooth niet verbonden");
        if(t!=null && t.battery!=null)label(mapCard,"Batterij "+t.battery+"% · gelezen "+date(t.batteryAt));
        if(observation!=null){
            label(mapCard,observation.stale || System.currentTimeMillis()-observation.observedAt>86400000L?"Oudere netwerkwaarneming":"Laatste netwerkwaarneming");label(mapCard,date(observation.observedAt));
            label(mapCard,observation.accuracy==null?"Nauwkeurigheid onbekend":String.format(Locale.forLanguageTag("nl-NL"),"Nauwkeurigheid circa %.0f meter",observation.accuracy));
        }else label(mapCard,cloud.signedIn && !Objects.equals(sn,cloud.serial)?"Deze tracker is lokaal bewaard; er is nog geen locatiekoppeling voor deze Narvie-toegang.":cloud.message);
        if(!mapReady)label(mapCard,"De kaart wordt geladen. De locatiegegevens blijven hieronder beschikbaar.");
        if(cloud.error!=null)error(mapCard,cloud.error);
        Button refresh=button(cloud.busy?"Locatie ophalen…":"Locatie vernieuwen",()->{if(cloud.signedIn)cloud.refresh();else login();});refresh.setEnabled(!cloud.busy && (!cloud.signedIn || Objects.equals(sn,cloud.serial)));mapCard.addView(refresh);
        if(observation!=null)mapCard.addView(button("Route naar deze waarneming",()->route(observation)));
        if(t!=null){Button action=button(ble.ready && Objects.equals(ble.serial,sn)?"Laat mijn tracker piepen":ble.connecting?"Verbinden…":"Dichtbij zoeken",()->permission(()->{if(ble.ready && Objects.equals(ble.serial,sn))ble.send(Protocol.RING);else ble.reconnect(t);}));action.setEnabled(!ble.busy && !ble.connecting && !ble.scanning);mapCard.addView(action);}
        if(store.tags.size()>1 || (!store.tags.isEmpty() && cloud.signedIn))mapCard.addView(button("Kies tracker",this::chooseTracker));
        if(cloud.signedIn)mapCard.addView(button("Afmelden voor locaties",cloud::logout));
        label(mapCard,"Echte gegevens zodra ontvangen · geen continue GPS-positie");
    }
    private void updateMap(){
        if(map==null || !mapReady)return;map.clear();CloudClient.Observation o=cloud.forSerial(selectedSerial());
        if(o==null){map.moveCamera(CameraUpdateFactory.newLatLngZoom(new LatLng(52.2,5.3),6));return;}
        LatLng point=new LatLng(o.latitude,o.longitude);map.addMarker(new MarkerOptions().position(point).title(selectedName()).snippet("Waargenomen "+date(o.observedAt)));map.animateCamera(CameraUpdateFactory.newLatLngZoom(point,15));
    }
    private void chooseTracker(){
        List<String> names=new ArrayList<>(),serials=new ArrayList<>();for(TagStore.Tag t:store.tags){names.add(t.name);serials.add(t.sn);}
        if(cloud.signedIn && store.find(cloud.serial)==null){names.add(cloud.name);serials.add(cloud.serial);}
        new AlertDialog.Builder(this).setTitle("Kies jouw tracker").setItems(names.toArray(new String[0]),(dialog,index)->{selected=serials.get(index);render();updateMap();}).setNegativeButton("Sluiten",null).show();
    }
    private void trackers(){
        LinearLayout page=page();heading(page,"Mijn trackers");label(page,"Dicht bij wat telt. Geef jouw tracker een naam en vind hem eenvoudig terug.");
        if(store.tags.isEmpty())label(page,"Je hebt nog geen tracker op deze telefoon bewaard.");
        for(TagStore.Tag t:new ArrayList<>(store.tags)){
            page.addView(button(t.name+" · "+TagStore.ICONS[t.icon],()->details(t)));
            label(page,t.battery==null?"Batterij nog niet gelezen":t.battery+"% · gelezen "+date(t.batteryAt));
        }
        page.addView(button("Mijn tracker toevoegen",()->{adding=true;own=false;render();}));
        if(ble.connecting || ble.busy || ble.ready)label(page,ble.status);
        label(page,"Persoonlijke versie 0.6.0 · eigen MyTag-project");
    }
    private void addPage(){
        LinearLayout page=page();heading(page,"Mijn tracker toevoegen");label(page,"Houd jouw tracker dichtbij en sluit MyTag tijdens het verbinden. Laat de bestaande MyTag-koppeling staan.");
        CheckBox ownership=new CheckBox(this);ownership.setText("Dit is mijn eigen tracker");ownership.setChecked(own);ownership.setEnabled(!ble.ready && !ble.connecting);ownership.setOnCheckedChangeListener((b,value)->own=value);page.addView(ownership);
        label(page,ble.status);
        Button scan=button(ble.scanning?"Stop zoeken":"Zoek mijn tracker",()->{if(!own){Toast.makeText(this,"Bevestig eerst dat dit jouw eigen tracker is.",Toast.LENGTH_SHORT).show();return;}if(ble.scanning){ble.stopScan();render();}else permission(ble::scan);});scan.setEnabled(!ble.connecting && !ble.busy && !ble.ready);page.addView(scan);
        if(!ble.ready && !ble.connecting){
            List<BleTracker.Nearby> items=new ArrayList<>(ble.nearby.values());items.sort((a,b)->Integer.compare(b.rssi,a.rssi));
            for(BleTracker.Nearby item:items)page.addView(button(item.name+" · "+item.address.substring(12)+" · "+item.rssi+" dBm",()->{if(own)ble.connect(item);}));
            label(page,"Kies zelf jouw tracker. De naam en het signaal bewijzen geen identiteit.");
        }
        if(ble.serial!=null){label(page,"Serienummer: "+ble.serial);label(page,"Firmware: "+(ble.firmware==null?"Wordt gelezen…":ble.firmware));}
        if(ble.battery!=null)label(page,"Batterij: "+ble.battery+"% · rechtstreeks gelezen");
        if(ble.ready && !ble.busy && Protocol.validSerial(ble.serial)){
            page.addView(button("Geef mijn tracker een naam en bewaar",()->edit(null)));
            page.addView(button("Laat deze tracker drie keer piepen",()->ble.send(Protocol.RING)));
            page.addView(button("Verbinding sluiten",()->{ble.suspend();render();}));
        }
        page.addView(button("Terug naar mijn trackers",()->{adding=false;render();}));
    }
    private void details(TagStore.Tag t){
        detailSerial=t.sn;selected=t.sn;LinearLayout page=page();heading(page,t.name);label(page,t.sn);label(page,"Firmware "+(t.firmware==null?"onbekend":t.firmware));
        label(page,ble.status);label(page,t.battery==null?"Batterij nog niet gelezen":t.battery+"% · gelezen "+date(t.batteryAt));
        Button connect=button(ble.ready && Objects.equals(ble.serial,t.sn)?"Laat mijn tracker piepen":"Opnieuw verbinden",()->{permission(()->{if(ble.canOperate(t.sn))ble.send(Protocol.RING);else ble.reconnect(t);});});connect.setEnabled(!ble.connecting && !ble.busy && !ble.scanning);page.addView(connect);
        if(ble.ready && Objects.equals(ble.serial,t.sn)){Button battery=button("Batterij vernieuwen",()->ble.send(Protocol.BATTERY_START));battery.setEnabled(ble.canOperate(t.sn));page.addView(battery);page.addView(button("Verbinding sluiten",ble::suspend));}
        page.addView(button("Laatste netwerkwaarneming",()->{tab="Kaart";render();updateMap();}));
        page.addView(button("Naam en pictogram wijzigen",()->edit(t)));
        page.addView(button("Verwijder uit deze app",()->new AlertDialog.Builder(this).setTitle("Lokaal verwijderen?").setMessage("Alleen de bewaarde naam en uitlezingen op deze telefoon verdwijnen. De tracker wordt niet gereset of uit MyTag ontkoppeld.").setNegativeButton("Annuleren",null).setPositiveButton("Verwijder lokaal",(d,w)->{store.remove(t.sn);if(Objects.equals(ble.serial,t.sn))ble.suspend();selected=null;render();updateMap();}).show()));
        page.addView(button("Terug naar mijn trackers",()->{detailSerial=null;render();}));
    }
    private void edit(TagStore.Tag existing){
        LinearLayout form=vertical();form.setPadding(dp(20),dp(8),dp(20),0);EditText name=new EditText(this);name.setSingleLine(true);name.setHint("Naam van je tracker");name.setFilters(new InputFilter[]{new InputFilter.LengthFilter(60)});name.setText(existing==null?draftName:existing.name);form.addView(name);
        Spinner icon=new Spinner(this);icon.setAdapter(new ArrayAdapter<>(this,android.R.layout.simple_spinner_dropdown_item,TagStore.ICONS));icon.setSelection(existing==null?draftIcon:existing.icon);form.addView(icon);
        AlertDialog dialog=new AlertDialog.Builder(this).setTitle("Maak hem herkenbaar").setView(form).setNegativeButton("Annuleren",null).setPositiveButton("Bewaren",null).create();
        dialog.setOnShowListener(d->dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v->{String label=name.getText().toString().trim();if(label.isEmpty()){name.setError("Vul een naam in");return;}
            boolean saved;if(existing==null){draftName=label;draftIcon=icon.getSelectedItemPosition();saved=ble.remember(label,draftIcon);selected=ble.serial;}else{existing.name=label;existing.icon=icon.getSelectedItemPosition();saved=store.put(existing);}
            if(saved){adding=false;dialog.dismiss();render();updateMap();}else Toast.makeText(this,"Bewaren lukte niet. Controleer de verbinding en probeer opnieuw.",Toast.LENGTH_LONG).show();}));dialog.show();
    }
    private void login(){
        LinearLayout form=vertical();form.setPadding(dp(22),dp(6),dp(22),dp(6));label(form,"Gebruik je persoonlijke Narvie-wachtwoord. Voor lokaal Bluetooth is aanmelden niet nodig.");
        EditText password=new EditText(this);password.setSingleLine(true);password.setHint("Narvie-wachtwoord");password.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_PASSWORD);password.setSaveEnabled(false);form.addView(password);
        label(form,"De sessie blijft tijdelijk in het geheugen. De kaart wordt geleverd door OpenFreeMap / OpenStreetMap.");
        AlertDialog dialog=new AlertDialog.Builder(this).setTitle("Mijn locaties").setView(form).setNegativeButton("Sluiten",(d,w)->password.setText("")).setPositiveButton("Aanmelden",null).create();
        dialog.setOnShowListener(d->dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v->{String value=password.getText().toString();if(value.isEmpty()){password.setError("Vul jouw Narvie-wachtwoord in");return;}password.setText("");dialog.dismiss();cloud.login(value);}));dialog.show();
    }
    private void permission(Runnable action){
        if(ble.permitted()){action.run();return;}permissionAction=action;
        if(Build.VERSION.SDK_INT>=31)requestPermissions(new String[]{Manifest.permission.BLUETOOTH_SCAN,Manifest.permission.BLUETOOTH_CONNECT},51);
        else new AlertDialog.Builder(this).setTitle("Bluetooth zoeken").setMessage("Deze Androidversie vraagt locatietoestemming om Bluetooth-apparaten te zoeken. Narvie leest daarmee geen telefoon-GPS uit.").setNegativeButton("Annuleren",(d,w)->permissionAction=null).setPositiveButton("Verder",(d,w)->requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION},51)).show();
    }
    @Override public void onRequestPermissionsResult(int request,String[] permissions,int[] results){super.onRequestPermissionsResult(request,permissions,results);if(request==51){Runnable action=permissionAction;permissionAction=null;if(ble.permitted() && action!=null)action.run();else Toast.makeText(this,"Toestemming ontbreekt. Je kunt deze later geven bij de appinstellingen.",Toast.LENGTH_LONG).show();}}
    private void help(){
        LinearLayout page=page();heading(page,"Hoe kunnen we helpen?");
        heading(page,"Dichtbij zoeken");label(page,"Voeg jouw eigen tracker toe, controleer het gelezen serienummer en bewaar hem. Opnieuw verbinden controleert eerst datzelfde serienummer. Daarna kun je batterij lezen en piepen.");
        heading(page,"Locatie op afstand");label(page,"Vernieuw bij Kaart de laatste netwerkwaarneming. De datum is het waarnemingstijdstip; dit is geen continue GPS-positie. Alleen de vooraf toegewezen sample is beschikbaar voor deze persoonlijke Narvie-toegang.");
        heading(page,"Jouw gegevens");label(page,"Namen, pictogrammen en vorige batterijmetingen worden alleen op deze telefoon bewaard. De Narvie-sessie en API-locaties blijven in het geheugen. Kaartgegevens komen van OpenFreeMap en OpenStreetMap. Route opent jouw kaartenapp.");
        label(page,"Bluetooth sluit als Narvie naar de achtergrond gaat. Er zijn geen achtergrondmeldingen, ontkoppelingen, resets of firmwarewijzigingen. Bestaande MyTag-koppelingen blijven staan.");
        page.addView(button("Mail Narvie",()->open(new Intent(Intent.ACTION_SENDTO,Uri.parse("mailto:contact@narvie-tracker.nl")))));label(page,"Narvie Trackers 0.6.0 · Android · persoonlijke testversie");
    }
    private void route(CloudClient.Observation o){open(new Intent(Intent.ACTION_VIEW,Uri.parse("geo:"+o.latitude+","+o.longitude+"?q="+o.latitude+","+o.longitude+"("+Uri.encode(selectedName())+")")));}
    private void open(Intent intent){try{startActivity(intent);}catch(ActivityNotFoundException e){Toast.makeText(this,"Geen geschikte app beschikbaar.",Toast.LENGTH_LONG).show();}}
    private LinearLayout page(){ScrollView scroller=new ScrollView(this);LinearLayout page=vertical();page.setPadding(dp(20),dp(10),dp(20),dp(20));scroller.addView(page);content.removeAllViews();content.addView(scroller);return page;}
    private LinearLayout vertical(){LinearLayout v=new LinearLayout(this);v.setOrientation(LinearLayout.VERTICAL);return v;}
    private TextView text(String value,int sp,int color){TextView v=new TextView(this);v.setText(value);v.setTextSize(sp);v.setTextColor(color);return v;}
    private void heading(LinearLayout parent,String value){TextView v=text(value,23,GREEN);v.setTypeface(null,Typeface.BOLD);v.setPadding(0,dp(10),0,dp(8));parent.addView(v);}
    private void label(LinearLayout parent,String value){TextView v=text(value==null?"":value,15,MUTED);v.setPadding(0,dp(4),0,dp(6));parent.addView(v);}
    private void error(LinearLayout parent,String value){TextView v=text(value,15,Color.rgb(155,37,37));v.setPadding(0,dp(6),0,dp(6));parent.addView(v);}
    private Button button(String title,Runnable action){Button b=new Button(this);b.setText(title);b.setTextSize(14);b.setAllCaps(false);b.setTextColor(GREEN);b.setMinHeight(dp(48));b.setOnClickListener(v->action.run());return b;}
    private GradientDrawable background(int color,float radius){GradientDrawable bg=new GradientDrawable();bg.setColor(color);bg.setCornerRadius(dp(radius));return bg;}
    private int dp(float size){return Math.round(size*getResources().getDisplayMetrics().density);}
    private String date(long time){return DateFormat.getDateTimeInstance(DateFormat.MEDIUM,DateFormat.SHORT,Locale.forLanguageTag("nl-NL")).format(new Date(time));}
    @Override protected void onStart(){super.onStart();foreground=true;mapView.onStart();render();}
    @Override protected void onResume(){super.onResume();mapView.onResume();}
    @Override protected void onPause(){mapView.onPause();super.onPause();}
    @Override protected void onStop(){foreground=false;ble.suspend();mapView.onStop();super.onStop();}
    @Override protected void onDestroy(){cloud.close();mapView.onDestroy();super.onDestroy();}
    @Override public void onLowMemory(){super.onLowMemory();mapView.onLowMemory();}
    @Override public void onSaveInstanceState(Bundle state){super.onSaveInstanceState(state);mapView.onSaveInstanceState(state);}
}
