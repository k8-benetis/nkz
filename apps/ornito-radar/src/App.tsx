// =============================================================================
// Ornito-Radar App - Remote Module for Bird Identification
// =============================================================================
// Professional micro-frontend module for identifying beneficial birds
// Uses Module Federation to be loaded dynamically by the Host application
//
// IMPORTANT: This component is loaded by the Host, which already provides:
// - NekazariI18nProvider (i18n context)
// - AuthProvider (authentication context)
// - Layout (navigation, sidebar)
//
// This component should NOT wrap itself with providers - it's just the content.

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useTranslation } from '@nekazari/sdk';
import { Card, Button } from '@nekazari/ui-kit';
import { 
  Bird as BirdIcon, Leaf, Bug, Mouse, Info, Search, 
  Filter, X, Calendar, MapPin, Users, Sparkles,
  ChevronRight, ExternalLink, Play, Pause
} from 'lucide-react';
import { beneficialBirds, Bird } from './data/birds';

type FilterType = 'all' | 'insects' | 'rodents' | 'seeds' | 'aerial';
type SeasonFilter = 'all' | 'year-round' | 'spring-summer' | 'winter' | 'migration';

const OrnitoRadarApp: React.FC = () => {
  const [playingAudio, setPlayingAudio] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [seasonFilter, setSeasonFilter] = useState<SeasonFilter>('all');
  const [selectedBird, setSelectedBird] = useState<Bird | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // Filter birds based on search and filters
  const filteredBirds = useMemo(() => {
    return beneficialBirds.filter(bird => {
      // Search filter
      const matchesSearch = 
        bird.commonName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        bird.scientificName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        bird.ecologicalFunction.toLowerCase().includes(searchQuery.toLowerCase()) ||
        bird.targetPests.some(pest => pest.toLowerCase().includes(searchQuery.toLowerCase()));

      // Type filter
      const matchesType = 
        filterType === 'all' ||
        (filterType === 'insects' && bird.ecologicalFunction.toLowerCase().includes('insecto')) ||
        (filterType === 'rodents' && bird.ecologicalFunction.toLowerCase().includes('roedor')) ||
        (filterType === 'seeds' && bird.ecologicalFunction.toLowerCase().includes('semilla')) ||
        (filterType === 'aerial' && bird.ecologicalFunction.toLowerCase().includes('aéreo'));

      // Season filter
      const matchesSeason = 
        seasonFilter === 'all' ||
        bird.season === seasonFilter;

      return matchesSearch && matchesType && matchesSeason;
    });
  }, [searchQuery, filterType, seasonFilter]);

  // Statistics
  const stats = useMemo(() => {
    const total = beneficialBirds.length;
    const yearRound = beneficialBirds.filter(b => b.season === 'year-round').length;
    const insectControl = beneficialBirds.filter(b => 
      b.ecologicalFunction.toLowerCase().includes('insecto') || 
      b.ecologicalFunction.toLowerCase().includes('oruga') ||
      b.ecologicalFunction.toLowerCase().includes('larva')
    ).length;
    const rodentControl = beneficialBirds.filter(b => 
      b.ecologicalFunction.toLowerCase().includes('roedor')
    ).length;
    const aerialControl = beneficialBirds.filter(b => 
      b.ecologicalFunction.toLowerCase().includes('aéreo')
    ).length;

    return { total, yearRound, insectControl, rodentControl, aerialControl };
  }, []);

  const handlePlayAudio = (birdId: string, xenoCantoId: string) => {
    // Stop current audio if playing
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }

    // If clicking the same bird, just stop
    if (playingAudio === birdId) {
      setPlayingAudio(null);
      return;
    }

    // Play new audio
    setPlayingAudio(birdId);
    const id = xenoCantoId.replace(/^XC/, '');
    const audioUrl = `https://xeno-canto.org/${id}/download`;
    const audio = new Audio(audioUrl);
    audioRef.current = audio;

    // Handle audio events
    audio.addEventListener('ended', () => {
      setPlayingAudio(null);
      audioRef.current = null;
    });

    audio.addEventListener('error', () => {
      console.warn(`[OrnitoRadar] Audio failed for ${birdId}, trying alternative URL`);
      const altUrl = `https://xeno-canto.org/sounds/uploaded/${id}.mp3`;
      const altAudio = new Audio(altUrl);
      audioRef.current = altAudio;
      
      altAudio.addEventListener('ended', () => {
        setPlayingAudio(null);
        audioRef.current = null;
      });

      altAudio.addEventListener('error', () => {
        console.error(`[OrnitoRadar] All audio URLs failed for ${birdId}`);
        setPlayingAudio(null);
        audioRef.current = null;
      });

      altAudio.play().catch((err) => {
        console.error(`[OrnitoRadar] Alternative audio also failed:`, err);
        setPlayingAudio(null);
        audioRef.current = null;
      });
    });

    audio.play().catch((error) => {
      console.error(`[OrnitoRadar] Error playing audio for ${birdId}:`, error);
      setPlayingAudio(null);
      audioRef.current = null;
    });
  };

  const getEcologicalIcon = (functionType: string) => {
    if (functionType.toLowerCase().includes('oruga') || functionType.toLowerCase().includes('larva')) {
      return <Bug className="w-5 h-5 text-green-600" />;
    }
    if (functionType.toLowerCase().includes('roedor')) {
      return <Mouse className="w-5 h-5 text-orange-600" />;
    }
    if (functionType.toLowerCase().includes('aéreo') || functionType.toLowerCase().includes('volador')) {
      return <Sparkles className="w-5 h-5 text-blue-600" />;
    }
    return <Leaf className="w-5 h-5 text-purple-600" />;
  };

  const getSeasonBadgeColor = (season: string) => {
    switch (season) {
      case 'year-round': return 'bg-green-100 text-green-700 border-green-300';
      case 'spring-summer': return 'bg-yellow-100 text-yellow-700 border-yellow-300';
      case 'winter': return 'bg-blue-100 text-blue-700 border-blue-300';
      case 'migration': return 'bg-purple-100 text-purple-700 border-purple-300';
      default: return 'bg-gray-100 text-gray-700 border-gray-300';
    }
  };

  const openBirdDetail = (bird: Bird) => {
    setSelectedBird(bird);
    setIsDetailModalOpen(true);
  };

  const closeBirdDetail = () => {
    setIsDetailModalOpen(false);
    setSelectedBird(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50">
      {/* Hero Header */}
      <div className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-8 md:py-12">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-sm">
                <BirdIcon className="w-10 h-10 md:w-12 md:h-12" />
              </div>
              <div>
                <h1 className="text-3xl md:text-5xl font-bold mb-2">
                  Ornito-Radar
                </h1>
                <p className="text-emerald-100 text-lg md:text-xl">
                  Aliados del Cultivo • Control Biológico Inteligente
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-xl px-4 py-2">
              <Users className="w-5 h-5" />
              <span className="text-2xl font-bold">{stats.total}</span>
              <span className="text-emerald-100">Especies</span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8">
        {/* Statistics Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <Card padding="md" className="bg-white border-2 border-emerald-200 hover:border-emerald-400 transition-colors">
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-4 h-4 text-emerald-600" />
              <span className="text-xs font-medium text-gray-600">Total</span>
            </div>
            <div className="text-2xl font-bold text-emerald-600">{stats.total}</div>
            <div className="text-xs text-gray-500">Especies</div>
          </Card>
          <Card padding="md" className="bg-white border-2 border-green-200 hover:border-green-400 transition-colors">
            <div className="flex items-center gap-2 mb-1">
              <Calendar className="w-4 h-4 text-green-600" />
              <span className="text-xs font-medium text-gray-600">Residentes</span>
            </div>
            <div className="text-2xl font-bold text-green-600">{stats.yearRound}</div>
            <div className="text-xs text-gray-500">Todo el año</div>
          </Card>
          <Card padding="md" className="bg-white border-2 border-blue-200 hover:border-blue-400 transition-colors">
            <div className="flex items-center gap-2 mb-1">
              <Bug className="w-4 h-4 text-blue-600" />
              <span className="text-xs font-medium text-gray-600">Insectos</span>
            </div>
            <div className="text-2xl font-bold text-blue-600">{stats.insectControl}</div>
            <div className="text-xs text-gray-500">Controladores</div>
          </Card>
          <Card padding="md" className="bg-white border-2 border-orange-200 hover:border-orange-400 transition-colors">
            <div className="flex items-center gap-2 mb-1">
              <Mouse className="w-4 h-4 text-orange-600" />
              <span className="text-xs font-medium text-gray-600">Roedores</span>
            </div>
            <div className="text-2xl font-bold text-orange-600">{stats.rodentControl}</div>
            <div className="text-xs text-gray-500">Controladores</div>
          </Card>
          <Card padding="md" className="bg-white border-2 border-purple-200 hover:border-purple-400 transition-colors">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="w-4 h-4 text-purple-600" />
              <span className="text-xs font-medium text-gray-600">Aéreos</span>
            </div>
            <div className="text-2xl font-bold text-purple-600">{stats.aerialControl}</div>
            <div className="text-xs text-gray-500">Controladores</div>
          </Card>
        </div>

        {/* Search and Filters */}
        <div className="mb-6 space-y-4">
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por nombre, especie, función ecológica o plaga..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all bg-white text-gray-900"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-500" />
              <span className="text-sm font-medium text-gray-700">Filtros:</span>
            </div>
            
            {/* Type Filter */}
            <div className="flex flex-wrap gap-2">
              {(['all', 'insects', 'rodents', 'seeds', 'aerial'] as FilterType[]).map((type) => (
                <button
                  key={type}
                  onClick={() => setFilterType(type)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    filterType === type
                      ? 'bg-emerald-600 text-white shadow-md'
                      : 'bg-white text-gray-700 border-2 border-gray-200 hover:border-emerald-300'
                  }`}
                >
                  {type === 'all' ? 'Todas' :
                   type === 'insects' ? 'Insectos' :
                   type === 'rodents' ? 'Roedores' :
                   type === 'seeds' ? 'Semillas' : 'Aéreos'}
                </button>
              ))}
            </div>

            {/* Season Filter */}
            <div className="flex flex-wrap gap-2 ml-auto">
              {(['all', 'year-round', 'spring-summer', 'winter', 'migration'] as SeasonFilter[]).map((season) => (
                <button
                  key={season}
                  onClick={() => setSeasonFilter(season)}
                  className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                    seasonFilter === season
                      ? 'bg-teal-600 text-white shadow-md'
                      : 'bg-white text-gray-700 border border-gray-200 hover:border-teal-300'
                  }`}
                >
                  {season === 'all' ? 'Todas las estaciones' :
                   season === 'year-round' ? 'Todo el año' :
                   season === 'spring-summer' ? 'Primavera-Verano' :
                   season === 'winter' ? 'Invierno' : 'Migratorias'}
                </button>
              ))}
            </div>
          </div>

          {/* Results Count */}
          <div className="text-sm text-gray-600">
            Mostrando <span className="font-semibold text-emerald-600">{filteredBirds.length}</span> de {beneficialBirds.length} especies
          </div>
        </div>

        {/* Birds Grid */}
        {filteredBirds.length === 0 ? (
          <Card padding="lg" className="text-center py-12">
            <BirdIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-700 mb-2">No se encontraron especies</h3>
            <p className="text-gray-500">Intenta ajustar los filtros o la búsqueda</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
            {filteredBirds.map((bird) => (
              <Card 
                key={bird.id} 
                padding="none" 
                className="group hover:shadow-2xl transition-all duration-300 border-2 border-gray-200 bg-white overflow-hidden cursor-pointer transform hover:-translate-y-1"
                onClick={() => openBirdDetail(bird)}
              >
                {/* Bird Image */}
                <div className="relative h-48 bg-gradient-to-br from-emerald-100 to-teal-100 overflow-hidden">
                  <img
                    src={bird.imageUrl}
                    alt={bird.commonName}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                    loading="lazy"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = `https://via.placeholder.com/400x300/10b981/ffffff?text=${encodeURIComponent(bird.commonName)}`;
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                  
                  {/* Badges */}
                  <div className="absolute top-3 right-3 flex flex-col gap-2">
                    <span className="inline-flex items-center px-2.5 py-1 text-xs font-bold rounded-full bg-emerald-500 text-white shadow-lg backdrop-blur-sm">
                      <Leaf className="w-3 h-3 mr-1" />
                      Aliado
                    </span>
                    {bird.status === 'common' && (
                      <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-white/90 text-gray-700 backdrop-blur-sm">
                        Común
                      </span>
                    )}
                  </div>

                  {/* Season Badge */}
                  <div className="absolute bottom-3 left-3">
                    <span className={`inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full border backdrop-blur-sm ${getSeasonBadgeColor(bird.season)}`}>
                      <Calendar className="w-3 h-3 mr-1" />
                      {bird.season === 'year-round' ? 'Todo el año' : 
                       bird.season === 'spring-summer' ? 'Primavera-Verano' :
                       bird.season === 'winter' ? 'Invierno' : 'Migratoria'}
                    </span>
                  </div>

                  {/* Hover Overlay */}
                  <div className="absolute inset-0 bg-emerald-600/0 group-hover:bg-emerald-600/10 transition-colors flex items-center justify-center">
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity transform translate-y-2 group-hover:translate-y-0">
                      <div className="bg-white/90 backdrop-blur-sm rounded-full p-3 shadow-lg">
                        <ChevronRight className="w-6 h-6 text-emerald-600" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bird Info */}
                <div className="p-4 space-y-3">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900 leading-tight mb-1">{bird.commonName}</h3>
                    <p className="text-xs text-gray-500 italic">{bird.scientificName}</p>
                  </div>

                  <div className="flex items-start gap-2 p-2.5 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-lg border border-emerald-100">
                    <div className="flex-shrink-0 mt-0.5">
                      {getEcologicalIcon(bird.ecologicalFunction)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-800 leading-tight">{bird.ecologicalFunction}</p>
                      <p className="text-xs text-gray-600 mt-1 line-clamp-2">
                        <span className="font-medium">Controla:</span> {bird.targetPests.slice(0, 3).join(', ')}
                        {bird.targetPests.length > 3 && '...'}
                      </p>
                    </div>
                  </div>

                  <p className="text-xs text-gray-600 line-clamp-2 leading-relaxed">{bird.description}</p>

                  <div className="flex items-center gap-2 text-xs text-gray-500 pt-2 border-t border-gray-100">
                    <MapPin className="w-3 h-3" />
                    <span className="truncate flex-1">{bird.habitat.split(',')[0]}</span>
                  </div>

                  {/* Audio Player */}
                  <div className="pt-2" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant={playingAudio === bird.id ? 'secondary' : 'primary'}
                      size="sm"
                      onClick={() => handlePlayAudio(bird.id, bird.xenoCantoId)}
                      className="w-full"
                    >
                      {playingAudio === bird.id ? (
                        <>
                          <Pause className="w-4 h-4 mr-2" />
                          Detener
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4 mr-2" />
                          Escuchar Canto
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Info Footer */}
        <div className="mt-8 p-6 bg-gradient-to-r from-emerald-50 to-teal-50 border-2 border-emerald-200 rounded-xl">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-emerald-100 rounded-lg">
              <Info className="w-6 h-6 text-emerald-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900 mb-2">Sobre Ornito-Radar</h3>
              <p className="text-sm text-gray-700 mb-3">
                Los audios se cargan desde <strong>Xeno-canto.org</strong>, una base de datos colaborativa de cantos de aves.
                Las imágenes provienen de <strong>Wikimedia Commons</strong> y son fotografías reales de las especies.
              </p>
              <p className="text-xs text-gray-600">
                Este módulo ayuda a los agricultores a identificar aves beneficiosas para el control biológico de plagas,
                promoviendo prácticas agrícolas sostenibles y respetuosas con el medio ambiente.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Detail Modal */}
      {isDetailModalOpen && selectedBird && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={closeBirdDetail}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="relative h-64 bg-gradient-to-br from-emerald-500 to-teal-500">
              <img
                src={selectedBird.imageUrl}
                alt={selectedBird.commonName}
                className="w-full h-full object-cover opacity-80"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = `https://via.placeholder.com/800x400/10b981/ffffff?text=${encodeURIComponent(selectedBird.commonName)}`;
                }}
              />
              <button
                onClick={closeBirdDetail}
                className="absolute top-4 right-4 p-2 bg-white/90 backdrop-blur-sm rounded-full hover:bg-white transition-colors"
              >
                <X className="w-5 h-5 text-gray-700" />
              </button>
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-6">
                <h2 className="text-3xl font-bold text-white mb-1">{selectedBird.commonName}</h2>
                <p className="text-emerald-100 italic">{selectedBird.scientificName}</p>
              </div>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-6">
              {/* Ecological Function */}
              <div className="flex items-start gap-4 p-4 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl border border-emerald-200">
                <div className="flex-shrink-0 p-2 bg-emerald-100 rounded-lg">
                  {getEcologicalIcon(selectedBird.ecologicalFunction)}
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900 mb-2">Función Ecológica</h3>
                  <p className="text-gray-700 mb-3">{selectedBird.ecologicalFunction}</p>
                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-2">Plagas que controla:</p>
                    <div className="flex flex-wrap gap-2">
                      {selectedBird.targetPests.map((pest: string, idx: number) => (
                        <span key={idx} className="px-3 py-1 bg-white rounded-full text-xs font-medium text-gray-700 border border-emerald-200">
                          {pest}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Description */}
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Descripción</h3>
                <p className="text-gray-700 leading-relaxed">{selectedBird.description}</p>
              </div>

              {/* Habitat & Season */}
              <div className="grid md:grid-cols-2 gap-4">
                <div className="p-4 bg-gray-50 rounded-xl">
                  <div className="flex items-center gap-2 mb-2">
                    <MapPin className="w-5 h-5 text-emerald-600" />
                    <h3 className="font-semibold text-gray-900">Hábitat</h3>
                  </div>
                  <p className="text-gray-700 text-sm">{selectedBird.habitat}</p>
                </div>
                <div className="p-4 bg-gray-50 rounded-xl">
                  <div className="flex items-center gap-2 mb-2">
                    <Calendar className="w-5 h-5 text-teal-600" />
                    <h3 className="font-semibold text-gray-900">Temporada</h3>
                  </div>
                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${getSeasonBadgeColor(selectedBird.season)}`}>
                    {selectedBird.season === 'year-round' ? 'Todo el año' : 
                     selectedBird.season === 'spring-summer' ? 'Primavera-Verano' :
                     selectedBird.season === 'winter' ? 'Invierno' : 'Migratoria'}
                  </span>
                </div>
              </div>

              {/* Audio Player */}
              <div className="pt-4 border-t border-gray-200">
                <Button
                  variant={playingAudio === selectedBird.id ? 'secondary' : 'primary'}
                  size="lg"
                  onClick={() => handlePlayAudio(selectedBird.id, selectedBird.xenoCantoId)}
                  className="w-full"
                >
                  {playingAudio === selectedBird.id ? (
                    <>
                      <Pause className="w-5 h-5 mr-2" />
                      Detener Canto
                    </>
                  ) : (
                    <>
                      <Play className="w-5 h-5 mr-2" />
                      Escuchar Canto
                    </>
                  )}
                </Button>
                <p className="text-xs text-gray-500 mt-2 text-center">
                  Audio proporcionado por <a href="https://xeno-canto.org" target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:underline inline-flex items-center gap-1">
                    Xeno-canto <ExternalLink className="w-3 h-3" />
                  </a>
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Export as default for Module Federation
export default OrnitoRadarApp;
